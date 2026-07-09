import type { ChannelAdapter, Connection, DraftContent, Review, StoreContext } from '../../../shared/channels/adapter.js';
import { buildHandoff } from './assisted-helpers.js';
import { crawlNaverPlaceReviews, extractPlaceId as extractReviewPlaceId } from '../../../shared/content-engine/review-crawler.js';
import { analyzeSentiment } from '../../../shared/content-engine/review-analyzer.js';

/**
 * 네이버 플레이스 — 반자동(소식 발행) + 모니터링(리뷰 크롤).
 * 소식/사진은 스마트플레이스 딥링크 + 붙여넣기. 리뷰는 m.place 크롤(읽기).
 */
export const naverPlaceAdapter: ChannelAdapter = {
  id: 'naver_place',
  mode: 'assisted',

  async connect(store: StoreContext, credentials): Promise<Connection> {
    const placeId = credentials?.placeId ?? extractPlaceId(store.naverPlaceUrl ?? '');
    return {
      channelId: 'naver_place',
      storeId: store.storeId,
      status: placeId ? 'connected' : 'pending',
      externalId: placeId ?? undefined,
    };
  },

  async publish(conn: Connection, draft: DraftContent) {
    return buildHandoff({
      deeplink: 'https://new.smartplace.naver.com/',
      draft,
      steps: [
        '스마트플레이스 → 소식 → 새 소식',
        '내용 붙여넣기',
        '사진 첨부 후 등록',
      ],
    });
  },

  async fetchReviews(conn: Connection): Promise<Review[]> {
    // m.place.naver.com/{id}/review/visitor 크롤 + 룰베이스 감정 태깅.
    // 답글초안 영속화까지는 backend/src/reviews.ts syncStoreReviews가 담당.
    const placeId =
      conn.externalId ?? extractReviewPlaceId((conn.metadata?.naverPlaceUrl as string) ?? '');
    if (!placeId) return [];
    const crawled = await crawlNaverPlaceReviews(placeId, { limit: 20 });
    return crawled.map((r) => ({
      externalId: r.externalId,
      author: r.author,
      content: r.content,
      postedAt: r.visitedAt ? `${r.visitedAt}T00:00:00+09:00` : undefined,
      sentiment: analyzeSentiment(r.content, r.keywords).sentiment,
    }));
  },
};

function extractPlaceId(url: string): string | null {
  const m = url.match(/place\/(\d+)/);
  return m ? m[1] : null;
}
