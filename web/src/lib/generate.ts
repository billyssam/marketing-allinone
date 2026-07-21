import type { SupabaseClient } from '@supabase/supabase-js';
import { persistDrafts, type PersistedPost } from '@/lib/posts';
import { generateChannelDrafts } from '@shared/content-engine/orchestrator';
import { placeFromBrandTone } from '@shared/content-engine/place-facts';
import { dailyDirective } from '@shared/content-engine/angles';
import { resolveOfferings } from '@shared/content-engine/offerings';
import { resolveBusinessType } from '@shared/business/taxonomy';
import type { ChannelId } from '@shared/channels/registry';
import type { DraftInput, IndustryId, BrandTone } from '@shared/content-engine/types';

/** 생성에 필요한 매장 행(부분) — /api/generate·온보딩 웰컴 드래프트 공용 */
export interface StoreRowForGen {
  id: string;
  name: string;
  industry_id?: string | null;
  naver_place_url?: string | null;
  naver_blog_url?: string | null;
  address?: string | null;
  brand_tone?: Record<string, unknown> | null;
}

export interface GenerateOpts {
  channels?: ChannelId[];
  targetLength?: 'short' | 'medium' | 'long';
  angle?: string;
  photos?: DraftInput['photos'];
}

/**
 * 매장 1곳 콘텐츠 생성 → posts 영속화 (Gemini 마스터 1회 + 채널 재단).
 * 크롤된 place_facts가 있으면 실사실(메뉴·가격·영업시간)을 프롬프트에 주입.
 */
export async function generateForStore(
  supabase: SupabaseClient,
  store: StoreRowForGen,
  opts: GenerateOpts = {},
): Promise<{ title: string; posts: PersistedPost[] }> {
  const input: DraftInput = {
    store: {
      id: store.id,
      name: store.name,
      industryId: (store.industry_id ?? 'cafe') as IndustryId,
      naverPlaceUrl: store.naver_place_url ?? undefined,
      naverBlogUrl: store.naver_blog_url ?? undefined,
      address: store.address ?? undefined,
      brandTone: (store.brand_tone ?? {}) as BrandTone,
    },
    place: placeFromBrandTone(store.brand_tone),
    photos: opts.photos ?? [],
    targetLength: opts.targetLength,
    // 각도 미지정 시 오늘의 각도+시점+중심소재를 기본 적용(수동 생성도 신선·시의성 있게)
    angle:
      opts.angle ??
      dailyDirective(
        resolveBusinessType(store.industry_id).offering,
        store.id,
        Date.now(),
        resolveOfferings(store.brand_tone, placeFromBrandTone(store.brand_tone)).map((o) => o.name),
      ).directive,
  };
  const channels: ChannelId[] = opts.channels?.length ? opts.channels : ['naver_blog'];

  const bundle = await generateChannelDrafts(input, channels);
  const posts = await persistDrafts(supabase, store.id, bundle);
  return { title: bundle.master.title, posts };
}
