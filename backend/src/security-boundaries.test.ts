import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeAuthRedirect } from '../../shared/auth-redirect.js';
import { publicationUrl, canConfirmPublication } from '../../shared/publication-proof.js';
import { verifyOAuthIdentity } from '../../shared/channels/oauth-identity.js';
import { readinessOf } from '../../shared/channels/readiness.js';

test('로그인 후 초안 주소와 query를 유지한다', () => {
  assert.equal(safeAuthRedirect('/prepare?post=123'), '/prepare?post=123');
});
test('외부 주소·프로토콜·인코딩 우회로 로그인 리다이렉트를 바꿀 수 없다', () => {
  for (const next of ['https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%2fevil.test', 'javascript:alert(1)', '/\nevil', '/%0aevil', '/%']) {
    assert.equal(safeAuthRedirect(next), '/dashboard', next);
  }
});
test('게시 근거 주소는 해당 채널의 HTTPS 주소만 허용한다', () => {
  assert.equal(publicationUrl('https://www.instagram.com/p/abc/#x', 'instagram'), 'https://www.instagram.com/p/abc/');
  assert.equal(publicationUrl('', 'blog'), '');
  for (const url of ['http://blog.naver.com/1', 'https://blog.naver.com.evil.test/1', 'javascript:alert(1)', 'https://user:pass@blog.naver.com/1', 'https://www.instagram.com/p/1']) {
    assert.equal(publicationUrl(url, 'blog'), null);
  }
});
test('실패·보관 상태는 게시 확인으로 바꿀 수 없다', () => {
  for (const status of ['failed', 'archived', 'unknown']) assert.equal(canConfirmPublication(status), false);
  for (const status of ['draft', 'ready', 'sent_to_owner']) assert.equal(canConfirmPublication(status), true);
});

function mockResponses(...responses: Array<object | number>): typeof fetch {
  let index = 0;
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token');
    assert.ok(!String(_url).includes('token'), '토큰은 URL에 넣지 않는다');
    const value = responses[index++];
    assert.notEqual(value, undefined, '예상하지 않은 외부 호출');
    return typeof value === 'number' ? new Response('{}', { status: value }) : Response.json(value);
  }) as typeof fetch;
}
const granted = { data: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'].map(permission => ({ permission, status: 'granted' })) };
test('인스타 실제 권한과 비즈니스 계정이 확인돼야 연결한다', async () => {
  assert.deepEqual(await verifyOAuthIdentity('instagram', 'token', mockResponses(granted, { data: [{ instagram_business_account: { id: '123' } }] })), { externalId: '123' });
});
test('권한 거부·계정 없음·여러 계정·HTTP 실패를 성공으로 처리하지 않는다', async () => {
  await assert.rejects(verifyOAuthIdentity('instagram', 'token', mockResponses({ data: [] })));
  for (const accounts of [[], [{ instagram_business_account: { id: '123' } }, { instagram_business_account: { id: '456' } }]]) {
    await assert.rejects(verifyOAuthIdentity('instagram', 'token', mockResponses(granted, { data: accounts })));
  }
  await assert.rejects(verifyOAuthIdentity('instagram', 'token', mockResponses(403)));
});
test('구글 관리 계정만으로 성공하지 않고 실제 매장을 확인한다', async () => {
  assert.deepEqual(await verifyOAuthIdentity('google_business', 'token', mockResponses(
    { accounts: [{ name: 'accounts/12' }] }, { locations: [{ name: 'locations/34' }] },
  )), { externalId: 'locations/34' });
  await assert.rejects(verifyOAuthIdentity('google_business', 'token', mockResponses({ accounts: [{ name: 'accounts/12' }] }, {})));
});
test('Meta 설정만으로 미구현 Facebook·Threads 연결 버튼을 열지 않는다', () => {
  // 직접 게시할 초안은 제공하지만 Meta 로그인으로 계정 연결됐다고 판정하지 않는다.
  assert.equal(readinessOf('facebook', ['META_APP_ID']), 'ready');
  assert.equal(readinessOf('threads', ['META_APP_ID']), 'ready');
});
test('알림톡은 운영 발송 계정이 준비돼야 고객 연결을 연다', () => {
  assert.equal(readinessOf('kakao_alimtalk'), 'waiting');
  assert.equal(readinessOf('kakao_alimtalk', ['ALIGO_API_KEY']), 'needsKey');
});
