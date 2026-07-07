import type { ChannelAdapter, Connection, DraftContent, PublishResult, StoreContext } from '../../../shared/channels/adapter.js';

/**
 * 카카오 알림톡 — 완전 자동 (알리고 API).
 * 재방문 유도·예약 알림·쿠폰. 승인된 템플릿 코드 필수.
 */
const ALIGO = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

export const alimtalkAdapter: ChannelAdapter = {
  id: 'kakao_alimtalk',
  mode: 'auto',

  async connect(store: StoreContext, credentials): Promise<Connection> {
    const ok = credentials?.apiKey && credentials?.userId && credentials?.senderKey;
    return {
      channelId: 'kakao_alimtalk',
      storeId: store.storeId,
      status: ok ? 'connected' : 'pending',
      metadata: {
        apiKey: credentials?.apiKey,
        userId: credentials?.userId,
        senderKey: credentials?.senderKey,
        sender: credentials?.sender,
      },
    };
  },

  async publish(conn: Connection, draft: DraftContent): Promise<PublishResult> {
    const m = conn.metadata ?? {};
    const templateCode = draft.meta?.templateCode as string | undefined;
    const receiver = draft.meta?.receiver as string | undefined;
    if (!m.apiKey || !templateCode || !receiver) {
      return { mode: 'auto', ok: false, error: '알림톡 파라미터 부족(템플릿·수신자)' };
    }
    const form = new URLSearchParams({
      apikey: String(m.apiKey),
      userid: String(m.userId),
      senderkey: String(m.senderKey),
      tpl_code: templateCode,
      sender: String(m.sender ?? ''),
      receiver_1: receiver.replace(/-/g, ''),
      message_1: draft.bodyPlain ?? '',
    });
    try {
      const res = await fetch(ALIGO, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
      const data = await res.json();
      return { mode: 'auto', ok: data.code === 0, error: data.code === 0 ? undefined : data.message };
    } catch (e) {
      return { mode: 'auto', ok: false, error: (e as Error).message };
    }
  },
};
