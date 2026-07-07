import type { ChannelAdapter, Connection, DraftContent, Metrics, PublishResult, StoreContext } from '../../../shared/channels/adapter.js';

/**
 * 인스타그램 — 완전 자동 (Meta Graph API).
 * 발행 2단계: ①미디어 컨테이너 생성 → ②publish.
 * 예약은 우리 스케줄러가 scheduledFor에 맞춰 호출.
 */
const GRAPH = 'https://graph.facebook.com/v21.0';

export const instagramAdapter: ChannelAdapter = {
  id: 'instagram',
  mode: 'auto',

  async connect(store: StoreContext, credentials): Promise<Connection> {
    // OAuth 콜백에서 받은 장기 토큰 + IG Business Account ID 저장
    const igUserId = credentials?.igUserId;
    const token = credentials?.accessToken;
    return {
      channelId: 'instagram',
      storeId: store.storeId,
      status: igUserId && token ? 'connected' : 'pending',
      externalId: igUserId,
      accessToken: token,
      expiresAt: credentials?.expiresAt,
    };
  },

  async publish(conn: Connection, draft: DraftContent): Promise<PublishResult> {
    if (!conn.externalId || !conn.accessToken) {
      return { mode: 'auto', ok: false, error: '인스타 연결 정보 없음' };
    }
    const image = draft.images?.[0]?.url;
    if (!image) return { mode: 'auto', ok: false, error: '이미지 필요' };
    const caption = [draft.bodyPlain ?? '', (draft.tags ?? []).map((t) => `#${t}`).join(' ')].filter(Boolean).join('\n\n');

    try {
      // 1) 컨테이너 생성
      const createRes = await fetch(`${GRAPH}/${conn.externalId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: image, caption, access_token: conn.accessToken }),
      });
      const created = await createRes.json();
      if (!created.id) throw new Error(created.error?.message ?? '컨테이너 생성 실패');

      // 2) 발행
      const pubRes = await fetch(`${GRAPH}/${conn.externalId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: created.id, access_token: conn.accessToken }),
      });
      const pub = await pubRes.json();
      if (!pub.id) throw new Error(pub.error?.message ?? '발행 실패');

      return { mode: 'auto', ok: true, externalUrl: `https://www.instagram.com/p/${pub.id}` };
    } catch (e) {
      return { mode: 'auto', ok: false, error: (e as Error).message };
    }
  },

  async fetchMetrics(conn: Connection, range): Promise<Metrics> {
    // insights: reach, impressions 등 (me/insights 경로)
    return { channelId: 'instagram', range, reach: 0, views: 0 };
  },
};
