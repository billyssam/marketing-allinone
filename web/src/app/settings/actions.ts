'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getBusinessType } from '@shared/business/taxonomy';
import { resolvePlaceUrl, placeUrlMessage } from '@/lib/place-url';
import type { StoreOffering } from '@shared/content-engine/types';

export async function updateStore(input: {
  name: string;
  industryId: string;
  naverPlaceUrl?: string;
  naverBlogUrl?: string;
  address?: string;
  offerings?: StoreOffering[];
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const name = input.name.trim();
  if (!name) return { error: '매장 이름을 입력해주세요.' };
  // 택소노미에 있는 업종만 허용(FK 충족). 모르는 값이면 기존 값을 지키기 위해 industry_id는 건드리지 않음.
  const validIndustry = getBusinessType(input.industryId) ? input.industryId : null;

  // 온보딩과 같은 규칙으로 확인·정규화한다(정규식 두 벌이 따로 놀면 한쪽만 고쳐진다).
  // 지도 앱 공유는 naver.me 단축 링크라 서버에서 펼쳐야 place id를 알 수 있다.
  let placeUrl: string | null = null;
  if (input.naverPlaceUrl?.trim()) {
    const checked = await resolvePlaceUrl(input.naverPlaceUrl);
    if (!checked.ok) return { error: placeUrlMessage(checked.reason as 'shortlink' | 'unknown') };
    placeUrl = checked.url;
  }

  // offerings는 brand_tone jsonb에 병합 저장(place_facts·voice 등 기존 값 보존)
  let offeringsPatch: Record<string, unknown> | null = null;
  if (input.offerings) {
    const cleaned: StoreOffering[] = input.offerings
      .map((o) => ({
        name: (o.name ?? '').trim(),
        price: typeof o.price === 'number' && !Number.isNaN(o.price) ? o.price : undefined,
        unit: o.unit?.trim() || undefined,
        note: o.note?.trim() || undefined,
      }))
      .filter((o) => o.name)
      .slice(0, 40);
    const { data: cur } = await supabase.from('stores').select('brand_tone').eq('owner_id', user.id).maybeSingle();
    const brandTone = (cur?.brand_tone as Record<string, unknown> | null) ?? {};
    offeringsPatch = { brand_tone: { ...brandTone, offerings: cleaned } };
  }

  const { error } = await supabase
    .from('stores')
    .update({
      name,
      ...(validIndustry ? { industry_id: validIndustry } : {}),
      naver_place_url: placeUrl,
      naver_blog_url: input.naverBlogUrl?.trim() || null,
      address: input.address?.trim() || null,
      ...(offeringsPatch ?? {}),
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * 회원 탈퇴 — 매장(FK cascade로 글·리뷰·단골·채널연결 전부)과 auth 계정을 즉시 삭제.
 * 개인정보처리방침 제4조("탈퇴 시 즉시 삭제") 이행. 되돌릴 수 없음.
 */
export async function deleteAccount(input: { confirm: string }): Promise<{ error?: string }> {
  if (input.confirm !== '삭제') return { error: "확인 문구 '삭제'를 정확히 입력해주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const admin = createServiceClient();
  // 1) 매장 삭제 — posts·reviews·regulars·channel_connections는 on delete cascade
  const { error: storeErr } = await admin.from('stores').delete().eq('owner_id', user.id);
  if (storeErr) return { error: `매장 데이터 삭제 실패: ${storeErr.message}` };

  // 2) 세션 쿠키 정리 후 auth 계정 삭제
  await supabase.auth.signOut();
  const { error: userErr } = await admin.auth.admin.deleteUser(user.id);
  if (userErr) return { error: `계정 삭제 실패: ${userErr.message}` };

  redirect('/');
}
