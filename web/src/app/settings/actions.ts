'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const INDUSTRIES = ['cafe', 'restaurant', 'vet', 'beauty', 'gym', 'kids'];

export async function updateStore(input: {
  name: string;
  industryId: string;
  naverPlaceUrl?: string;
  naverBlogUrl?: string;
  address?: string;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const name = input.name.trim();
  if (!name) return { error: '매장 이름을 입력해주세요.' };
  const industryId = INDUSTRIES.includes(input.industryId) ? input.industryId : 'cafe';

  const placeUrl = input.naverPlaceUrl?.trim() || null;
  // 플레이스 URL 넣었으면 place id 추출 가능한지 가벼운 검증(리뷰 수집 전제)
  if (placeUrl && !/place\/\d+/.test(placeUrl) && !/\/\d{6,}/.test(placeUrl)) {
    return { error: '네이버 플레이스 주소 형식을 확인해주세요 (place/숫자 포함).' };
  }

  const { error } = await supabase
    .from('stores')
    .update({
      name,
      industry_id: industryId,
      naver_place_url: placeUrl,
      naver_blog_url: input.naverBlogUrl?.trim() || null,
      address: input.address?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  return { ok: true };
}
