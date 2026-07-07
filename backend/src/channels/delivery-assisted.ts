import type { ChannelAdapter, Connection, DraftContent, Review, StoreContext } from '../../../shared/channels/adapter.js';
import { buildHandoff } from './assisted-helpers.js';

/** 당근마켓 — 반자동. 비즈프로필 글/단골쿠폰은 앱 딥링크 + 붙여넣기. */
export const danggeunAdapter: ChannelAdapter = {
  id: 'danggeun',
  mode: 'assisted',
  async connect(store: StoreContext, credentials): Promise<Connection> {
    return { channelId: 'danggeun', storeId: store.storeId, status: credentials?.bizId ? 'connected' : 'pending', externalId: credentials?.bizId };
  },
  async publish(_conn: Connection, draft: DraftContent) {
    return buildHandoff({
      deeplink: 'https://www.daangn.com/kr/business/',
      draft,
      steps: ['당근 비즈니스 → 소식 작성', '내용 붙여넣기', '사진 첨부 후 게시'],
    });
  },
};

/** 배달의민족 — 반자동(리뷰답글·공지) + 모니터링(리뷰 크롤). */
export const baeminAdapter: ChannelAdapter = {
  id: 'baemin',
  mode: 'assisted',
  async connect(store: StoreContext, credentials): Promise<Connection> {
    return { channelId: 'baemin', storeId: store.storeId, status: credentials?.shopId ? 'connected' : 'pending', externalId: credentials?.shopId };
  },
  async publish(_conn: Connection, draft: DraftContent) {
    return buildHandoff({
      deeplink: 'https://ceo.baemin.com/',
      draft,
      steps: ['배민사장님 → 리뷰/공지', '답글·공지 붙여넣기', '등록'],
    });
  },
  async fetchReviews(): Promise<Review[]> {
    return []; // VM 크롤 워커가 채움
  },
};
