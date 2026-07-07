import type { ChannelAdapter, Connection, DraftContent, Review, StoreContext } from '../../../shared/channels/adapter.js';
import { buildHandoff } from './assisted-helpers.js';

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
    // 실제 구현: Oracle VM 크롤 워커가 m.place.naver.com/{id}/review 파싱
    // (Pre-Service place-crawler 로직 재활용) → 여기선 인터페이스만
    void conn;
    return [];
  },
};

function extractPlaceId(url: string): string | null {
  const m = url.match(/place\/(\d+)/);
  return m ? m[1] : null;
}
