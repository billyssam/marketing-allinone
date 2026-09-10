import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * OAuth `state` 서명 검증 — **콜백 라우트와 같은 로직**을 여기서 지킨다.
 *
 * 왜: state 검증이 조용히 무력화되면 **남의 계정이 내 매장에 붙는다**(CSRF).
 * 화면에는 아무 티도 안 나고, 붙은 뒤에야 안다. 그래서 규칙을 코드로 못 박는다.
 */
function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** 콜백의 verifyState 와 동일한 판정 */
function verify(state: string, secret: string): { storeId: string; channel: string } | null {
  const [body, sig] = (state ?? '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let got: Buffer;
  try { got = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.at !== 'number' || Date.now() - p.at > 10 * 60_000) return null;
    if (!p.storeId || !p.channel) return null;
    return { storeId: String(p.storeId), channel: String(p.channel) };
  } catch { return null; }
}

const SECRET = 'operator-app-secret';
const fresh = () => ({ storeId: 'store-1', channel: 'instagram', nonce: 'abc', at: Date.now() });

test('올바른 서명은 통과한다', () => {
  const v = verify(sign(fresh(), SECRET), SECRET);
  assert.equal(v?.storeId, 'store-1');
  assert.equal(v?.channel, 'instagram');
});

test('🔴 남의 시크릿으로 만든 state 는 거부한다 — 이게 뚫리면 남의 계정이 붙는다', () => {
  assert.equal(verify(sign(fresh(), 'attacker-secret'), SECRET), null);
});

test('🔴 본문만 바꿔치기해도 거부한다(매장 id 바꿔 남의 매장에 붙이기)', () => {
  const good = sign(fresh(), SECRET);
  const [, sig] = good.split('.');
  const evil = Buffer.from(JSON.stringify({ ...fresh(), storeId: 'victim-store' })).toString('base64url');
  assert.equal(verify(`${evil}.${sig}`, SECRET), null);
});

test('10분 지난 state 는 거부한다 — 굴러다니는 링크 재사용 방지', () => {
  const old = { storeId: 's', channel: 'instagram', nonce: 'n', at: Date.now() - 11 * 60_000 };
  assert.equal(verify(sign(old, SECRET), SECRET), null);
});

test('깨진 입력에도 던지지 않는다 — 라우트가 500 으로 죽으면 안 된다', () => {
  for (const bad of ['', '.', 'nodot', 'a.b', '!!!.???', 'x.'.repeat(50)]) {
    assert.doesNotThrow(() => verify(bad, SECRET));
    assert.equal(verify(bad, SECRET), null);
  }
});

test('필수 값이 빠지면 거부한다', () => {
  assert.equal(verify(sign({ channel: 'instagram', at: Date.now() }, SECRET), SECRET), null);
  assert.equal(verify(sign({ storeId: 's', at: Date.now() }, SECRET), SECRET), null);
});
