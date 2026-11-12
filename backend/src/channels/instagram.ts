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
    const caption = [draft.bodyPlain ?? '', [...new Set((draft.tags ?? []).map((t) => t.replace(/^#+/, '').trim()).filter(Boolean))]
      .filter((tag) => !(draft.bodyPlain ?? '').includes(`#${tag}`)).map((t) => `#${t}`).join(' ')].filter(Boolean).join('\n\n');

    let published = false;
    try {
      // 1) 컨테이너 생성
      const createRes = await fetch(`${GRAPH}/${conn.externalId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.accessToken}` },
        body: JSON.stringify({ image_url: image, caption }),
        signal: AbortSignal.timeout(15000),
      });
      const created = await createRes.json();
      if (!createRes.ok || !created.id) throw new Error('컨테이너 생성 실패');

      // 2) 발행
      const pubRes = await fetch(`${GRAPH}/${conn.externalId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.accessToken}` },
        body: JSON.stringify({ creation_id: created.id }),
        signal: AbortSignal.timeout(15000),
      });
      const pub = await pubRes.json();
      if (!pubRes.ok || !pub.id) throw new Error('발행 실패');
      published = true;

      const proof = await fetch(`${GRAPH}/${encodeURIComponent(pub.id)}?fields=permalink`, {
        headers: { Authorization: `Bearer ${conn.accessToken}` }, signal: AbortSignal.timeout(15000),
      });
      const posted = await proof.json();
      if (!proof.ok || typeof posted.permalink !== 'string' || !/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[^/?#]+\//.test(posted.permalink)) {
        // Publishing already succeeded. Never report an ordinary retryable error
        // here: that would encourage posting the same media twice.
        return { mode: 'auto', ok: true, error: '게시 요청은 완료됐지만 주소를 확인하지 못했어요. 인스타그램에서 확인한 뒤 다시 게시하지 마세요.' };
      }
      return { mode: 'auto', ok: true, externalUrl: posted.permalink };
    } catch (e) {
      return { mode: 'auto', ok: published, error: published
        ? '게시 요청은 완료됐지만 주소 확인에 실패했어요. 인스타그램에서 확인하고 다시 게시하지 마세요.'
        : '게시 결과를 확인하지 못했어요. 인스타그램에서 중복 여부를 먼저 확인해주세요.' };
    }
  },

  async fetchMetrics(conn: Connection, range): Promise<Metrics> {
    // insights: reach, impressions 등 (me/insights 경로)
    return { channelId: 'instagram', range };
  },
};
