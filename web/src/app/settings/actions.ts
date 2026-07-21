'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getBusinessType } from '@shared/business/taxonomy';
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

  const placeUrl = input.naverPlaceUrl?.trim() || null;
  // 플레이스 URL 넣었으면 place id 추출 가능한지 가벼운 검증(리뷰 수집 전제)
  if (placeUrl && !/place\/\d+/.test(placeUrl) && !/\/\d{6,}/.test(placeUrl)) {
    return { error: '네이버 플레이스 주소 형식을 확인해주세요 (place/숫자 포함).' };
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
