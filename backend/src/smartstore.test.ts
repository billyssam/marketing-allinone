/**
 * 스마트스토어 커머스 API 어댑터 검증.
 *
 * 여기서 **못 하는 것**을 먼저 적는다: 실제 판매자 키가 없으므로 네이버 서버 왕복은 검증하지 못한다.
 * 대신 키 없이도 틀릴 수 있는 것 — 전자서명 조립·구간 쪼개기·실패 처리·거짓 성공 — 을 전부 못 박는다.
 * (실키 검증은 첫 고객이 키를 넣는 순간 `connect()` 가 `/v1/seller/channels` 를 실제로 불러 판정한다)
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { kstIso, signClientSecret, splitWindows, smartstoreAdapter } from './channels/smartstore.js';

/** 네이버가 발급하는 시크릿과 같은 모양(bcrypt salt). 라운드만 낮춰 테스트를 빠르게 한다 */
const SALT = '$2a$04$abcdefghijklmnopqrstuv';

test('전자서명은 clientId_timestamp 를 시크릿(=salt)으로 해싱한 뒤 base64 한다', () => {
  const sign = signClientSecret('my-client', SALT, 1_700_000_000_000);
  const decoded = Buffer.from(sign, 'base64').toString('utf-8');

  assert.ok(decoded.startsWith('$2a$04$'), `bcrypt 해시가 아니다: ${decoded}`);
  assert.ok(bcrypt.compareSync('my-client_1700000000000', decoded), '검증 가능한 해시가 아니다');
});

test('같은 (id, timestamp) 면 서명이 같다 — 시크릿이 salt 라서 결정적이다', () => {
  const a = signClientSecret('my-client', SALT, 1_700_000_000_000);
  const b = signClientSecret('my-client', SALT, 1_700_000_000_000);
  assert.equal(a, b);
});

test('timestamp 가 다르면 서명이 달라진다 — 재사용 공격을 막는 지점이다', () => {
  const a = signClientSecret('my-client', SALT, 1_700_000_000_000);
  const b = signClientSecret('my-client', SALT, 1_700_000_001_000);
  assert.notEqual(a, b);
});

test('조회 구간을 24시간 이하로 쪼갠다 — 넓게 물으면 네이버가 거절한다', () => {
  const from = Date.parse('2026-09-01T00:00:00+09:00');
  const to = Date.parse('2026-09-04T00:00:00+09:00');
  const win = splitWindows(from, to);

  assert.equal(win.length, 3);
  for (const w of win) assert.ok(w.to - w.from <= 24 * 60 * 60 * 1000, '24시간을 넘는 조각이 있다');
  assert.equal(win[0].from, from);
  assert.equal(win[win.length - 1].to, to, '마지막 조각이 끝 시각을 넘거나 모자라면 안 된다');
});

test('구간 사이에 빈틈이 없다 — 빈틈은 "주문 0건"으로 조용히 둔갑한다', () => {
  const from = Date.parse('2026-09-01T00:00:00+09:00');
  const to = Date.parse('2026-09-03T05:00:00+09:00');
  const win = splitWindows(from, to);
  for (let i = 1; i < win.length; i++) assert.equal(win[i].from, win[i - 1].to);
});

test('거꾸로거나 같은 구간이면 빈 배열 — 호출을 아예 하지 않는다', () => {
  const t = Date.parse('2026-09-01T00:00:00+09:00');
  assert.deepEqual(splitWindows(t, t), []);
  assert.deepEqual(splitWindows(t, t - 1000), []);
});

test('아주 긴 구간도 상한에서 멈춘다 — 무한 루프·과호출 방지', () => {
  const from = Date.parse('2020-01-01T00:00:00+09:00');
  const to = Date.parse('2026-09-01T00:00:00+09:00');
  assert.equal(splitWindows(from, to).length, 62);
});

test('시각은 +09:00 오프셋이 붙은 형태로 보낸다 — Z 로 보내면 9시간이 어긋난다', () => {
  const iso = kstIso(Date.parse('2026-09-10T00:00:00+09:00'));
  assert.equal(iso, '2026-09-10T00:00:00.000+09:00');
  assert.ok(!iso.includes('Z'));
});

test('🔴 publish 는 성공을 사칭하지 않는다 — 스마트스토어엔 글 올리는 API 가 없다', async () => {
  const res = await smartstoreAdapter.publish(
    { channelId: 'smartstore', storeId: 's1', status: 'connected', accessToken: 'tok' },
    { title: '가을 신메뉴', bodyPlain: '본문' },
  );
  assert.equal(res.ok, false, '아무 데도 안 올렸는데 ok:true 면 대시보드가 거짓말을 한다');
  assert.ok(res.error && res.error.length > 0);
  assert.ok(!res.externalUrl, '가짜 링크를 돌려주면 안 된다');
});

test('키가 없으면 pending — 연결됐다고 적지 않는다', async () => {
  const conn = await smartstoreAdapter.connect({ storeId: 's1', name: '가게', industryId: 'cafe' });
  assert.equal(conn.status, 'pending');
  assert.equal(conn.accessToken, undefined);
});

test('토큰 발급이 실패하면 error 로 떨어진다 — 토큰 없이 connected 가 되면 안 된다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('{"code":"UNAUTHORIZED"}', { status: 401 })) as typeof fetch;
  try {
    const conn = await smartstoreAdapter.connect(
      { storeId: 's1', name: '가게', industryId: 'cafe' },
      { clientId: 'my-client', clientSecret: SALT },
    );
    assert.equal(conn.status, 'error');
    assert.equal(conn.accessToken, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('에러 메시지에 시크릿이 남지 않는다 — 로그로 새어 나가는 자리다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(`{"message":"bad ${SALT}"}`, { status: 400 })) as typeof fetch;
  try {
    const conn = await smartstoreAdapter.connect(
      { storeId: 's1', name: '가게', industryId: 'cafe' },
      { clientId: 'my-client', clientSecret: SALT },
    );
    const msg = String(conn.metadata?.error ?? '');
    assert.ok(msg.length > 0);
    assert.ok(!msg.includes(SALT), `시크릿이 그대로 남았다: ${msg}`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('연결이 안 된 상태면 지표를 0 이 아니라 "없음"으로 둔다 — 0 은 매출 0 이라는 뜻이 된다', async () => {
  const m = await smartstoreAdapter.fetchMetrics!(
    { channelId: 'smartstore', storeId: 's1', status: 'pending' },
    { from: '2026-09-01T00:00:00+09:00', to: '2026-09-02T00:00:00+09:00' },
  );
  assert.equal(m.conversions, undefined);
  assert.equal(m.revenue, undefined);
});

test('같은 주문이 여러 번 바뀌어도 한 건으로 센다 + series 는 건수 축이다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('last-changed-statuses')) {
      // 같은 주문(1001)이 결제→발송으로 두 번 등장한다 — 실제로 자주 일어난다
      return new Response(
        JSON.stringify({ data: { lastChangeStatuses: [
          { productOrderId: '1001' }, { productOrderId: '1001' }, { productOrderId: '1002' },
        ] } }),
        { status: 200 },
      );
    }
    if (url.includes('product-orders/query')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { productOrderIds: string[] };
      assert.equal(body.productOrderIds.length, 2, '중복을 그대로 조회하면 안 된다');
      return new Response(
        JSON.stringify({ data: [
          { productOrderId: '1001', productOrder: { totalPaymentAmount: 12000, productOrderStatus: 'PAYED' }, order: { orderDate: '2026-09-01T10:00:00+09:00' } },
          { productOrderId: '1002', productOrder: { totalPaymentAmount: 30000, productOrderStatus: 'CANCELED' }, order: { orderDate: '2026-09-01T11:00:00+09:00' } },
        ] }),
        { status: 200 },
      );
    }
    throw new Error(`예상 못 한 호출: ${url}`);
  }) as typeof fetch;
  try {
    const m = await smartstoreAdapter.fetchMetrics!(
      { channelId: 'smartstore', storeId: 's1', status: 'connected', accessToken: 'tok' },
      { from: '2026-09-01T00:00:00+09:00', to: '2026-09-02T00:00:00+09:00' },
    );
    assert.equal(m.conversions, 1, '취소 건을 성과로 세면 안 된다');
    assert.equal(m.revenue, 12000, '취소 금액이 매출에 섞였다');
    assert.deepEqual(m.series, [{ date: '2026-09-01', value: 1 }], 'series 는 금액이 아니라 건수여야 한다');
  } finally {
    globalThis.fetch = realFetch;
  }
});
