import type { ChannelAdapter } from '../../../shared/channels/adapter.js';
import type { ChannelId } from '../../../shared/channels/registry.js';
import { naverBlogAdapter } from './naver-blog.js';
import { naverPlaceAdapter } from './naver-place.js';
import { instagramAdapter } from './instagram.js';
import { smartstoreAdapter } from './smartstore.js';
import { alimtalkAdapter } from './kakao-alimtalk.js';
import { danggeunAdapter, baeminAdapter } from './delivery-assisted.js';

/**
 * 채널 어댑터 레지스트리. 새 채널 = 여기 등록 1줄.
 * Wave 1 (P1~7) 구현분. 나머지는 로드맵 순서대로 추가.
 */
export const ADAPTERS: Partial<Record<ChannelId, ChannelAdapter>> = {
  naver_place: naverPlaceAdapter,
  naver_blog: naverBlogAdapter,
  instagram: instagramAdapter,
  smartstore: smartstoreAdapter,
  kakao_alimtalk: alimtalkAdapter,
  danggeun: danggeunAdapter,
  baemin: baeminAdapter,
};

export function getAdapter(id: ChannelId): ChannelAdapter | null {
  return ADAPTERS[id] ?? null;
}

export function implementedChannels(): ChannelId[] {
  return Object.keys(ADAPTERS) as ChannelId[];
}
