import type { ChannelAdapter, Connection, DraftContent, PublishResult, StoreContext } from '../../../shared/channels/adapter.js';

/**
 * 네이버 스마트스토어 — 완전 자동 (커머스 API).
 * 상품 등록/수정·주문·문의답변. OAuth2 client_credentials + bcrypt 서명.
 * 여기선 상품 소식/공지 발행 인터페이스 + 인증 골격.
 */
const COMMERCE = 'https://api.commerce.naver.com/external';

export const smartstoreAdapter: ChannelAdapter = {
  id: 'smartstore',
  mode: 'auto',

  async connect(store: StoreContext, credentials): Promise<Connection> {
    const clientId = credentials?.clientId;
    const clientSecret = credentials?.clientSecret;
    if (!clientId || !clientSecret) {
      return { channelId: 'smartstore', storeId: store.storeId, status: 'pending' };
    }
    try {
      const token = await issueToken(clientId, clientSecret);
      return {
        channelId: 'smartstore',
        storeId: store.storeId,
        status: 'connected',
        accessToken: token.access_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        metadata: { clientId },
      };
    } catch (e) {
      return { channelId: 'smartstore', storeId: store.storeId, status: 'error', metadata: { error: (e as Error).message } };
    }
  },

  async publish(conn: Connection, draft: DraftContent): Promise<PublishResult> {
    // 스마트스토어 "쇼핑 소식" 또는 상품 상세 업데이트
    // 실제: POST /v1/... (상품 API). 여기선 골격.
    if (conn.status !== 'connected') return { mode: 'auto', ok: false, error: '스토어 미연결' };
    void draft;
    return { mode: 'auto', ok: true, externalUrl: 'https://smartstore.naver.com/' };
  },
};

async function issueToken(clientId: string, clientSecret: string) {
  // 커머스 API: timestamp + bcrypt(clientId_timestamp, clientSecret) 서명 필요
  // 실제 구현 시 bcrypt 서명 생성. 여기선 형태만.
  const res = await fetch(`${COMMERCE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, grant_type: 'client_credentials', type: 'SELF' }),
  });
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}
