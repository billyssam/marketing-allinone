import type { ChannelAdapter, Connection, DraftContent, StoreContext } from '../../../shared/channels/adapter.js';
import { buildHandoff } from './assisted-helpers.js';

/**
 * 네이버 블로그 — 반자동 (검증 완료).
 * 서버가 초안을 준비 → 크롬확장/딥링크로 SmartEditor 열고 3단계 붙여넣기.
 * (Pre-Service-Blog-Instagram에서 End-to-End 발행 검증됨)
 */
export const naverBlogAdapter: ChannelAdapter = {
  id: 'naver_blog',
  mode: 'assisted',

  async connect(store: StoreContext, credentials): Promise<Connection> {
    // 블로그는 OAuth 불필요 — 사장님 blogId만 저장 + 확장 설치 확인
    const blogId = credentials?.blogId;
    return {
      channelId: 'naver_blog',
      storeId: store.storeId,
      status: blogId ? 'connected' : 'pending',
      externalId: blogId,
      metadata: { needsExtension: true },
    };
  },

  async publish(conn: Connection, draft: DraftContent) {
    const blogId = conn.externalId ?? '';
    return buildHandoff({
      deeplink: `https://blog.naver.com/${blogId}?Redirect=Write`,
      draft,
      includeTags: true,
      steps: [
        '제목 자리 클릭 → 붙여넣기',
        '본문 첫 문단 클릭 → 붙여넣기',
        '발행 팝업에서 태그 붙여넣기',
        '발행 버튼 클릭',
      ],
    });
  },
};
