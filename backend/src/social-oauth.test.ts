import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyBoundOAuthState } from '../../shared/channels/oauth-state.js';
import assert from 'node:assert/strict';
import { OAUTH_CONFIG, buildAuthUrl } from '../../shared/channels/oauth-config.js';
import { exchangeSocialCode, facebookPages, verifyFacebookPage, threadsIdentity, refreshThreadsToken, socialConnectionUsable } from '../../shared/channels/social-oauth.js';
import { sealFacebookSelection, openFacebookSelection, facebookSelectionHtml } from '../../shared/channels/facebook-selection.js';
import { readinessOf } from '../../shared/channels/readiness.js';

function provider(...values: unknown[]) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    assert.ok(['graph.facebook.com', 'graph.threads.com'].includes(url.hostname));
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.ok(init.signal, 'provider requests must time out');
    calls.push({ url, init });
    const value = values.shift();
    assert.notEqual(value, undefined, 'unexpected provider request');
    if (value instanceof Error) throw value;
    return typeof value === 'number' ? new Response('{}', { status: value }) : Response.json(value);
  }) as typeof fetch;
  return { fetcher, calls };
}
const permissions = { data: ['pages_show_list', 'pages_read_engagement'].map(permission => ({ permission, status: 'granted' })) };
const pages = [{ id: '123', name: 'First Page', access_token: 'page-token-one' }, { id: '456', name: '<img src=x onerror=alert(1)>', access_token: 'page-token-two' }];
const now = Date.UTC(2026, 9, 27, 8);

test('dedicated app setup gates Facebook and Threads; Threads is not routed through Facebook Login', () => {
  assert.equal(readinessOf('facebook', ['META_APP_ID']), 'ready');
  assert.equal(readinessOf('threads', ['META_APP_ID']), 'ready');
  assert.equal(readinessOf('facebook', ['FACEBOOK_APP_ID']), 'oauth');
  assert.equal(readinessOf('threads', ['THREADS_APP_ID']), 'oauth');
  const url = new URL(buildAuthUrl({ cfg: OAUTH_CONFIG.threads!, channel: 'threads', origin: 'https://marketing-allinone.vercel.app', clientId: 'threads-id', state: 'signed-state' }));
  assert.equal(url.origin, 'https://www.threads.com');
  assert.equal(url.searchParams.get('scope'), 'threads_basic');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://marketing-allinone.vercel.app/api/connect/threads/callback');
});

test('Facebook keeps all allowed pages for explicit selection and never renders tokens or active markup', async () => {
  const mock = provider(permissions, { data: pages });
  const choices = await facebookPages('owner-user-token', mock.fetcher);
  assert.equal(choices.length, 2);
  const html = facebookSelectionHtml(choices, 'nonce');
  assert.ok(html.includes('name="pageId" value="123"'));
  assert.ok(html.includes('name="pageId" value="456"'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  for (const token of ['owner-user-token', ...pages.map(p => p.access_token)]) assert.ok(!html.includes(token));
  assert.equal(mock.calls[1].init.headers && (mock.calls[1].init.headers as any).Authorization, 'Bearer owner-user-token');
  assert.ok(!mock.calls[1].url.toString().includes('owner-user-token'));
});

test('Facebook rejects refused permissions, missing pages, duplicate IDs and malformed pagination', async () => {
  for (const mock of [provider({ data: [] }), provider(permissions, { data: [] }), provider(permissions, { data: [pages[0], pages[0]] }), provider(permissions, { data: pages, paging: { next: 'https://evil.test' } })]) {
    await assert.rejects(facebookPages('owner-token', mock.fetcher));
  }
});

test('Facebook pagination never follows a supplied next URL or its token', async () => {
  const mock = provider(permissions, { data: [pages[0]], paging: { next: 'https://evil.test/?access_token=private', cursors: { after: 'cursor-1' } } }, { data: [pages[1]] });
  const result = await facebookPages('owner-token', mock.fetcher);
  assert.equal(result.length, 2);
  assert.equal(mock.calls[2].url.hostname, 'graph.facebook.com');
  assert.equal(mock.calls[2].url.searchParams.get('after'), 'cursor-1');
  assert.ok(!mock.calls[2].url.toString().includes('private'));
});

test('a selected Facebook page must match the identity returned by its Page token', async () => {
  const page = { id: '123', name: 'QA', accessToken: 'page-token' };
  await verifyFacebookPage(page, provider({ id: '123' }).fetcher);
  await assert.rejects(verifyFacebookPage(page, provider({ id: '456' }).fetcher));
  await assert.rejects(verifyFacebookPage(page, provider(401).fetcher));
});

test('Facebook selection cookie is encrypted, owner/store bound, expiring and tamper resistant', () => {
  const token = { accessToken: 'qa-user-token', issuedAt: now, expiresIn: 3600 };
  const sealed = sealFacebookSelection('owner-1', 'store-1', token, 'app-secret', now);
  assert.ok(!sealed.includes(token.accessToken));
  assert.equal(openFacebookSelection(sealed, 'app-secret', 'owner-1', 'store-1', now)?.token.accessToken, token.accessToken);
  assert.equal(openFacebookSelection(sealed, 'app-secret', 'other-owner', 'store-1', now), null);
  assert.equal(openFacebookSelection(sealed, 'app-secret', 'owner-1', 'other-store', now), null);
  assert.equal(openFacebookSelection(sealed, 'other-secret', 'owner-1', 'store-1', now), null);
  assert.equal(openFacebookSelection(sealed, 'app-secret', 'owner-1', 'store-1', now + 600_000), null);
  assert.equal(openFacebookSelection((sealed[0] === 'A' ? 'B' : 'A') + sealed.slice(1), 'app-secret', 'owner-1', 'store-1', now), null);
  assert.throws(() => sealFacebookSelection('owner-1', 'store-1', { ...token, accessToken: 'x'.repeat(8192) }, 'app-secret', now));
});

test('Threads exchanges code using its own app and checks short-token account identity', async () => {
  const mock = provider({ access_token: 'short', user_id: '789' }, { access_token: 'long', expires_in: 5184000 }, { id: '789', username: 'qa' });
  const token = await exchangeSocialCode('threads', OAUTH_CONFIG.threads!, { clientId: 'threads-app', secret: 'private-secret', code: 'one-time-code', redirectUri: 'https://marketing-allinone.vercel.app/api/connect/threads/callback' }, mock.fetcher);
  assert.equal(token.accessToken, 'long'); assert.equal(token.subjectId, '789');
  assert.equal(mock.calls[0].init.method, 'POST');
  const form = mock.calls[0].init.body as URLSearchParams;
  assert.equal(form.get('client_id'), 'threads-app');
  assert.equal(form.get('redirect_uri'), 'https://marketing-allinone.vercel.app/api/connect/threads/callback');
  assert.equal(mock.calls[1].url.hostname, 'graph.threads.com');
  assert.equal(mock.calls[1].url.searchParams.get('grant_type'), 'th_exchange_token');
  assert.deepEqual(await threadsIdentity(token.accessToken, token.subjectId, mock.fetcher), { externalId: '789' });
  await assert.rejects(threadsIdentity(token.accessToken, token.subjectId, provider({ id: '999' }).fetcher));
});

test('Facebook also obtains a long-lived user token before selecting Page tokens', async () => {
  const mock = provider({ access_token: 'short' }, { access_token: 'long', expires_in: 5184000 });
  const token = await exchangeSocialCode('facebook', OAUTH_CONFIG.facebook!, { clientId: 'facebook-app', secret: 'private', code: 'code', redirectUri: 'https://app.test/callback' }, mock.fetcher);
  assert.equal(token.accessToken, 'long');
  assert.equal(mock.calls[1].url.pathname, '/v26.0/oauth/access_token');
  assert.equal(mock.calls[1].url.searchParams.get('grant_type'), 'fb_exchange_token');
});

test('malformed/failed exchanges fail closed without reflecting provider secrets or URLs', async () => {
  const args = { clientId: 'app', secret: 'must-not-leak', code: 'code', redirectUri: 'https://app.test/callback' };
  for (const mock of [provider(new Error('https://provider.test?client_secret=must-not-leak')), provider({ error: { message: 'must-not-leak' } }), provider({ access_token: 'short', user_id: '789' }, { access_token: 'long' }), provider({ access_token: 'short' }, { access_token: 'long', expires_in: 3600 })]) {
    await assert.rejects(exchangeSocialCode('threads', OAUTH_CONFIG.threads!, args, mock.fetcher), error => error instanceof Error && !error.message.includes(args.secret));
  }
});

test('Threads refresh refuses too-young and expired tokens before making a provider call', async () => {
  const mock = provider({ access_token: 'fresh', expires_in: 5184000 });
  const token = { accessToken: 'old', expiresIn: 5184000, issuedAt: now, subjectId: '789' };
  await assert.rejects(refreshThreadsToken(token, mock.fetcher, now + 86399_000));
  await assert.rejects(refreshThreadsToken(token, mock.fetcher, now + token.expiresIn * 1000));
  assert.equal(mock.calls.length, 0);
  const fresh = await refreshThreadsToken(token, mock.fetcher, now + 86400_000);
  assert.equal(fresh.subjectId, '789'); assert.equal(fresh.issuedAt, now + 86400_000);
  assert.equal((mock.calls[0].init.headers as any).Authorization, 'Bearer old');
  assert.ok(!mock.calls[0].url.toString().includes('old'));
});

test('connected flags without valid identity, token and unexpired lifetime are not usable', () => {
  const valid = { status: 'connected', access_token: 'token', external_id: '123', expires_at: new Date(now + 1000).toISOString() };
  assert.equal(socialConnectionUsable(valid, now), true);
  for (const bad of [{ ...valid, status: 'pending' }, { ...valid, access_token: null }, { ...valid, external_id: null }, { ...valid, expires_at: null }, { ...valid, expires_at: 'bad-date' }, { ...valid, expires_at: new Date(now).toISOString() }]) assert.equal(socialConnectionUsable(bad, now), false);
});

test('a valid OAuth signature still requires the initiating browser nonce and exact channel', () => {
  const secret = 'fake-test-secret', nonce = 'a'.repeat(24);
  const body = Buffer.from(JSON.stringify({ storeId: 'store-1', channel: 'threads', nonce, at: Date.now() })).toString('base64url');
  const state = body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
  assert.equal(verifyBoundOAuthState(state, secret, 'threads', nonce)?.storeId, 'store-1');
  assert.equal(verifyBoundOAuthState(state, secret, 'threads', undefined), null);
  assert.equal(verifyBoundOAuthState(state, secret, 'threads', 'b'.repeat(24)), null);
  assert.equal(verifyBoundOAuthState(state, secret, 'facebook', nonce), null);
});
