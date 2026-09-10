import type { ChannelAdapter, Connection, DraftContent, Metrics, PublishResult, StoreContext } from '../../../shared/channels/adapter.js';
import { commerceGet, commercePost, kstIso, splitWindows, verifySmartstoreKey } from '../../../shared/channels/smartstore-api.js';

/**
 * 네이버 스마트스토어 — **커머스 API 실연동**.
 *
 * 🔴 이 파일은 원래 거짓말이었다(2026-09-10 정리 전):
 *   · `publish()` 가 아무것도 안 하고 `ok: true` 를 돌려줬다 → 대시보드 "올림" 숫자에 그대로 들어간다
 *   · `issueToken()` 이 **전자서명을 안 붙였다** → 네이버가 무조건 거절하는데 `res.ok` 를 안 봐서
 *     `connect()` 는 accessToken 이 undefined 인 채로 status:'connected' 를 돌려줬다
 * 두 가지 다 "버린 것을 성과로 세는" 유형이다. 그래서 전부 실제 호출로 바꿨다.
 *
 * 흐름 구분([[feedback-operator-vs-customer-setup]]):
 *   운영자(우리)  : 할 일 없음 — 스마트스토어는 우리 앱을 등록하지 않는다
 *   고객(사장님)  : **판매자센터에서 자기 애플리케이션 ID·시크릿을 발급**해 넣는다(진짜 고객 것)
 *
 * 인증·호출은 `shared/channels/smartstore-api.ts` 에 있다 — 키를 저장하는 화면(web)과
 * 지표를 긁는 배치(backend)가 **같은 검증**을 쓰게 하려고 일부러 shared 에 뒀다.
 */

interface ProductOrderDetail {
  productOrderId?: string;
  productOrder?: { totalPaymentAmount?: number; productOrderStatus?: string };
  order?: { orderDate?: string };
}

/** 결제 완료 이후 단계만 매출로 센다 — 취소·반품은 성과가 아니다 */
const REVENUE_STATUSES = new Set(['PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED']);

export const smartstoreAdapter: ChannelAdapter = {
  id: 'smartstore',
  mode: 'auto',

  /**
   * 키를 받아 **실제로 한 번 호출해 보고** 연결 여부를 정한다.
   * 토큰만 받고 '연결됨' 이라고 적으면, 권한이 모자란 키가 붙은 걸 지표가 빌 때까지 모른다.
   */
  async connect(store: StoreContext, credentials): Promise<Connection> {
    const clientId = credentials?.clientId;
    const clientSecret = credentials?.clientSecret;
    if (!clientId || !clientSecret) {
      return { channelId: 'smartstore', storeId: store.storeId, status: 'pending' };
    }

    const check = await verifySmartstoreKey(clientId, clientSecret);
    if (!check.ok) {
      return { channelId: 'smartstore', storeId: store.storeId, status: 'error', metadata: { error: check.error } };
    }
    return {
      channelId: 'smartstore',
      storeId: store.storeId,
      status: 'connected',
      externalId: check.externalId,
      accessToken: check.accessToken,
      expiresAt: check.expiresAt,
      metadata: { clientId, storeName: check.storeName },
    };
  },

  /**
   * 🔴 스마트스토어에는 **마케팅 글을 올리는 공개 API 가 없다.**
   * 커머스 API 가 주는 건 상품·주문·문의·정산이다. 쇼핑 소식/스토어 공지는 판매자센터에서만 쓴다.
   *
   * 그래서 여기서 `ok: true` 를 돌려주면 안 된다 — 아무 데도 안 올라간 글이
   * 대시보드 "올림" 에 잡히고, 사장님은 올라간 줄 안다.
   * 이 채널의 값어치는 발행이 아니라 **`fetchMetrics`(주문·매출)** 다.
   */
  async publish(_conn: Connection, _draft: DraftContent): Promise<PublishResult> {
    return {
      mode: 'auto',
      ok: false,
      error: '스마트스토어는 글을 올리는 채널이 아니에요 — 주문·매출을 가져오는 데 씁니다',
    };
  },

  /**
   * 기간 내 주문 건수·매출을 가져온다.
   *
   * 2단계인 이유: 변경이력 API 는 **주문 번호만** 준다. 금액은 상세 조회로 다시 물어야 한다.
   * 한 단계로 끝내려 하면 금액이 없어서 "주문은 늘었는데 매출은 0" 이 된다.
   */
  async fetchMetrics(conn: Connection, range: { from: string; to: string }): Promise<Metrics> {
    const base: Metrics = { channelId: 'smartstore', range };
    if (conn.status !== 'connected' || !conn.accessToken) return base;

    const fromMs = Date.parse(range.from);
    const toMs = Date.parse(range.to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return base;

    const token = conn.accessToken;
    const ids: string[] = [];
    for (const w of splitWindows(fromMs, toMs)) {
      const q = new URLSearchParams({ lastChangedFrom: kstIso(w.from), lastChangedTo: kstIso(w.to) });
      const res = (await commerceGet(token, `/v1/pay-order/seller/product-orders/last-changed-statuses?${q}`)) as
        | { data?: { lastChangeStatuses?: { productOrderId?: string }[] } }
        | null;
      for (const s of res?.data?.lastChangeStatuses ?? []) {
        if (s.productOrderId) ids.push(s.productOrderId);
      }
    }

    // 같은 주문이 상태가 여러 번 바뀌면 이력에 여러 번 나온다 — 중복을 세면 주문 수가 부풀려진다
    const unique = [...new Set(ids)];
    if (!unique.length) return { ...base, conversions: 0, revenue: 0, series: [] };

    // ⚠️ `series` 는 **주문 건수**다 — `conversions` 와 같은 축이어야 한다.
    //    금액을 같은 줄에 섞으면 합계와 그래프가 서로 다른 걸 세게 된다([[feedback-no-single-number-lies]]).
    const ordersByDay = new Map<string, number>();
    let revenue = 0;
    let counted = 0;
    for (let i = 0; i < unique.length; i += 300) {
      const res = (await commercePost(token, '/v1/pay-order/seller/product-orders/query', {
        productOrderIds: unique.slice(i, i + 300),
      })) as { data?: ProductOrderDetail[] } | null;
      for (const d of res?.data ?? []) {
        if (!REVENUE_STATUSES.has(d.productOrder?.productOrderStatus ?? '')) continue;
        counted += 1;
        revenue += d.productOrder?.totalPaymentAmount ?? 0;
        const day = (d.order?.orderDate ?? '').slice(0, 10);
        if (day) ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1);
      }
    }

    return {
      ...base,
      conversions: counted,
      revenue,
      series: [...ordersByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    };
  },
};
