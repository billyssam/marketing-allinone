import bcrypt from 'bcryptjs';
import type { ChannelAdapter, Connection, DraftContent, Metrics, PublishResult, StoreContext } from '../../../shared/channels/adapter.js';

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
 * 인증: OAuth2 client_credentials + **bcrypt 전자서명**.
 *   password        = `${clientId}_${timestamp}`
 *   client_secret_sign = base64( bcrypt(password, clientSecret) )   ← clientSecret 이 곧 salt 다
 */
const COMMERCE = 'https://api.commerce.naver.com/external';

/** 서버 시계가 조금 빨라도 거절당하지 않도록 뒤로 당긴다(네이버가 미래 timestamp 를 거절한다) */
const CLOCK_SKEW_MS = 3_000;

/** 변경상품주문 조회는 한 번에 **24시간**까지만 본다 — 그래서 하루씩 끊는다 */
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 한 번의 지표 수집에서 볼 수 있는 최대 일수 — 무한 루프와 과호출을 동시에 막는다 */
const MAX_DAYS = 62;

/**
 * 전자서명 만들기.
 *
 * clientSecret 은 비밀번호가 아니라 **bcrypt salt**(`$2a$10$...` 형태)다.
 * 그래서 같은 (clientId, timestamp) 면 결과가 항상 같다 — 테스트로 못 박을 수 있다.
 */
export function signClientSecret(clientId: string, clientSecret: string, timestamp: number): string {
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, 'utf-8').toString('base64');
}

/** 에러 메시지에 시크릿이 섞여 나가지 않게 지운다 — 로그는 남고 키는 남으면 안 된다 */
function scrub(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join('***');
  return out.slice(0, 300);
}

export interface SmartstoreToken {
  access_token: string;
  expires_in: number;
}

/**
 * 액세스 토큰 발급. 실패하면 **던진다** — 조용히 undefined 를 들고 '연결됨' 이 되지 않도록.
 */
export async function issueToken(clientId: string, clientSecret: string): Promise<SmartstoreToken> {
  const timestamp = Date.now() - CLOCK_SKEW_MS;
  const res = await fetch(`${COMMERCE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      timestamp: String(timestamp),
      client_secret_sign: signClientSecret(clientId, clientSecret, timestamp),
      grant_type: 'client_credentials',
      type: 'SELF',
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`토큰 발급 실패(${res.status}) ${scrub(text, clientId, clientSecret)}`);
  }
  let json: Partial<SmartstoreToken>;
  try {
    json = JSON.parse(text) as Partial<SmartstoreToken>;
  } catch {
    throw new Error(`토큰 응답이 JSON 이 아니다: ${scrub(text, clientId, clientSecret)}`);
  }
  if (!json.access_token) {
    throw new Error(`토큰이 비어 있다: ${scrub(text, clientId, clientSecret)}`);
  }
  return { access_token: json.access_token, expires_in: json.expires_in ?? 10_800 };
}

async function commerceGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${COMMERCE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} 실패(${res.status}) ${scrub(text, token)}`);
  return text ? JSON.parse(text) : null;
}

async function commercePost(token: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${COMMERCE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} 실패(${res.status}) ${scrub(text, token)}`);
  return text ? JSON.parse(text) : null;
}

/** `2026-09-10T00:00:00.000+09:00` — 네이버는 오프셋이 붙은 형태만 받는다 */
export function kstIso(ms: number): string {
  const KST = 9 * 60 * 60 * 1000;
  return new Date(ms + KST).toISOString().replace('Z', '+09:00');
}

/**
 * 조회 구간을 **24시간 이하 조각**으로 쪼갠다.
 * 한 번에 넓게 물으면 네이버가 거절하는데, 거절을 삼키면 "주문 0건"으로 보인다 —
 * 매출이 0이라는 말과 구분이 안 되는 종류라 반드시 쪼개서 물어야 한다.
 */
export function splitWindows(fromMs: number, toMs: number): { from: number; to: number }[] {
  if (!(toMs > fromMs)) return [];
  const capped = Math.min(toMs, fromMs + MAX_DAYS * MAX_WINDOW_MS);
  const out: { from: number; to: number }[] = [];
  for (let cur = fromMs; cur < capped; cur += MAX_WINDOW_MS) {
    out.push({ from: cur, to: Math.min(cur + MAX_WINDOW_MS, capped) });
  }
  return out;
}

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
   * 토큰만 받고 '연결됨' 이라고 적으면, 권한이 모자란 키가 붙은 걸 발행 실패 때까지 모른다.
   */
  async connect(store: StoreContext, credentials): Promise<Connection> {
    const clientId = credentials?.clientId;
    const clientSecret = credentials?.clientSecret;
    if (!clientId || !clientSecret) {
      return { channelId: 'smartstore', storeId: store.storeId, status: 'pending' };
    }
    try {
      const token = await issueToken(clientId, clientSecret);
      const channels = (await commerceGet(token.access_token, '/v1/seller/channels')) as
        | { channelNo?: number; name?: string }[]
        | null;
      const first = Array.isArray(channels) ? channels[0] : undefined;
      return {
        channelId: 'smartstore',
        storeId: store.storeId,
        status: 'connected',
        externalId: first?.channelNo != null ? String(first.channelNo) : undefined,
        accessToken: token.access_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        metadata: { clientId, storeName: first?.name },
      };
    } catch (e) {
      return {
        channelId: 'smartstore',
        storeId: store.storeId,
        status: 'error',
        metadata: { error: (e as Error).message },
      };
    }
  },

  /**
   * 🔴 스마트스토어에는 **마케팅 글을 올리는 공개 API 가 없다.**
   * 커머스 API 가 주는 건 상품·주문·문의·정산이다. 쇼핑 소식/스토어 공지는 판매자센터에서만 쓴다.
   *
   * 그래서 여기서 `ok: true` 를 돌려주면 안 된다 — 아무 데도 안 올라간 글이
   * 대시보드 "올림" 에 잡히고, 사장님은 올라간 줄 안다.
   * 이 채널의 값어치는 발행이 아니라 **`fetchMetrics`(매출·주문)** 다.
   */
  async publish(_conn: Connection, _draft: DraftContent): Promise<PublishResult> {
    return {
      mode: 'auto',
      ok: false,
      error: '스마트스토어는 글을 올리는 채널이 아니에요 — 주문·매출을 가져오는 데 씁니다',
    };
  },

  /**
   * 기간 내 주문 건수·매출을 가져온다. 대시보드의 `conversions` 가 이걸로 채워진다.
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
    if (!unique.length) return { ...base, conversions: 0, series: [] };

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
