/**
 * Meta signed_request 서명 검증 회귀 테스트.
 * 실행: npx tsx --test src/meta-signed-request.test.ts
 *
 * 이게 뚫리면 **누구나 남의 인스타 연동을 끊을 수 있다.**
 * 삭제 콜백은 인증 헤더가 없고 서명만이 유일한 방어선이라 여기만은 느슨하면 안 된다.
 *
 * ⚠️ 라우트 파일(next/server 의존)을 import하면 백엔드 테스트에서 못 돈다 →
 *    검증 로직을 **같은 알고리즘으로 여기 재현**해 규격을 고정한다.
 *    (라우트가 바뀌면 이 테스트가 규격 문서 역할을 한다)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = 'test-app-secret-8919';

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** 라우트의 parseSignedRequest와 동일한 규격 */
function parseSignedRequest(signed: string, appSecret: string): { user_id?: string } | null {
  const [sigPart, payloadPart] = (signed ?? '').split('.');
  if (!sigPart || !payloadPart) return null;
  let payload: { algorithm?: string; user_id?: string };
  try {
    payload = JSON.parse(fromB64url(payloadPart).toString('utf8'));
  } catch {
    return null;
  }
  if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return null;
  const expected = createHmac('sha256', appSecret).update(payloadPart).digest();
  const got = fromB64url(sigPart);
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;
  return payload;
}

function sign(payloadObj: unknown, secret = SECRET): string {
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj), 'utf8'));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${sig}.${payload}`;
}

test('정상 서명은 통과하고 user_id를 돌려준다', () => {
  const signed = sign({ algorithm: 'HMAC-SHA256', user_id: '17841400000000000', issued_at: 1787000000 });
  const p = parseSignedRequest(signed, SECRET);
  assert.equal(p?.user_id, '17841400000000000');
});

test('시크릿이 다르면 거부한다(위조 방어)', () => {
  const forged = sign({ algorithm: 'HMAC-SHA256', user_id: '남의계정' }, 'attacker-secret');
  assert.equal(parseSignedRequest(forged, SECRET), null);
});

test('페이로드를 바꿔치기하면 거부한다', () => {
  const signed = sign({ algorithm: 'HMAC-SHA256', user_id: '내계정' });
  const [sig] = signed.split('.');
  const swapped = b64url(Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '남의계정' }), 'utf8'));
  assert.equal(parseSignedRequest(`${sig}.${swapped}`, SECRET), null);
});

test('algorithm을 none으로 주장해도 거부한다(서명 우회 시도)', () => {
  const payload = b64url(Buffer.from(JSON.stringify({ algorithm: 'none', user_id: '남의계정' }), 'utf8'));
  assert.equal(parseSignedRequest(`.${payload}`, SECRET), null);
  assert.equal(parseSignedRequest(`AAAA.${payload}`, SECRET), null);
});

test('깨진 입력에도 터지지 않는다', () => {
  for (const bad of ['', '.', 'onlyonepart', 'a.b', '....', 'zzz.zzz']) {
    assert.doesNotThrow(() => parseSignedRequest(bad, SECRET));
    assert.equal(parseSignedRequest(bad, SECRET), null);
  }
});

test('서명 길이가 달라도 timingSafeEqual이 터지지 않는다', () => {
  const signed = sign({ algorithm: 'HMAC-SHA256', user_id: 'x' });
  const [, payload] = signed.split('.');
  // 짧은 서명 — 길이 비교 없이 timingSafeEqual을 부르면 예외가 난다
  assert.doesNotThrow(() => parseSignedRequest(`AA.${payload}`, SECRET));
  assert.equal(parseSignedRequest(`AA.${payload}`, SECRET), null);
});
