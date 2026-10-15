import type { ChannelAdapter, Connection, DraftContent, Review, StoreContext } from '../../../shared/channels/adapter.js';
import { buildHandoff, stripHtml } from './assisted-helpers.js';
import { DAANGN_PUBLICATION, daangnPublicationText } from '../../../shared/channels/daangn-publication.js';

/** 당근 소식 초안과 직접 게시 안내. 쿠폰 발송·자동 게시는 지원하지 않는다. */
export const danggeunAdapter: ChannelAdapter = {
  id: 'danggeun',
  mode: 'assisted',
  async connect(store: StoreContext, credentials): Promise<Connection> {
    return { channelId: 'danggeun', storeId: store.storeId, status: credentials?.bizId ? 'connected' : 'pending', externalId: credentials?.bizId };
  },
  async publish(_conn: Connection, draft: DraftContent) {
    return buildHandoff({
      deeplink: DAANGN_PUBLICATION.entryUrl,
      draft: { ...draft, title: undefined, bodyPlain: daangnPublicationText({ ...draft, bodyPlain: draft.bodyPlain || stripHtml(draft.bodyHtml ?? '') }) },
      steps: [DAANGN_PUBLICATION.limit, DAANGN_PUBLICATION.limitHelp, ...DAANGN_PUBLICATION.steps],
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
