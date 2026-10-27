import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { checkGeminiIdentity } from '../../web/src/lib/server/gemini-identity-probe';

const now = 1_800_000_000_000;
const token = 'x'.repeat(43);
const key = 'fake-key-for-offline-identity-tests';
const nonce = 'a'.repeat(64);
const proof = (k: string) => createHmac('sha256', k).update('marketing-allinone:gemini-identity:v1\0' + nonce).digest('hex');
const config = { tokenSha256: createHash('sha256').update(token).digest('hex'), issuedAt: now - 1000, expiresAt: now + 1000 };
const environment = (extra = {}) => ({ VERCEL_ENV: 'production', GOOGLE_GENERATIVE_AI_API_KEY: key, GEMINI_IDENTITY_PROBE_CONFIG: JSON.stringify(config), ...extra });
const request = (body: unknown = { nonce, proof: proof(key) }, auth = token, contentType = 'application/json') => new Request('https://example.invalid/api/internal/gemini-identity-check', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': contentType }, body: JSON.stringify(body) });

test('matching key returns only a boolean and non-secret metadata', async () => {
  const response = await checkGeminiIdentity(request(), environment(), now);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['checkedAt', 'deploymentSha', 'match']);
  assert.equal(body.match, true);
  assert.ok(!JSON.stringify(body).includes(key));
  assert.ok(!JSON.stringify(body).includes(proof(key)));
});
test('different candidate does not match', async () => {
  assert.equal((await (await checkGeminiIdentity(request({ nonce, proof: proof('other-fake-key') }), environment(), now)).json()).match, false);
});
test('missing activation and preview both remain hidden', async () => {
  for (const env of [environment({ GEMINI_IDENTITY_PROBE_CONFIG: undefined }), environment({ VERCEL_ENV: 'preview' })]) {
    assert.equal((await checkGeminiIdentity(request(), env, now)).status, 404);
  }
});
test('expired, future and oversized activation windows remain hidden', async () => {
  for (const c of [{ ...config, expiresAt: now }, { ...config, issuedAt: now + 1 }, { ...config, expiresAt: now + 900_001 }]) {
    assert.equal((await checkGeminiIdentity(request(), environment({ GEMINI_IDENTITY_PROBE_CONFIG: JSON.stringify(c) }), now)).status, 404);
  }
});
test('bad authorization cannot read comparison results', async () => {
  assert.equal((await checkGeminiIdentity(request(undefined, 'z'.repeat(43)), environment(), now)).status, 404);
  assert.equal((await checkGeminiIdentity(request(undefined, ''), environment(), now)).status, 404);
});
test('invalid content, raw-key field and oversized body are rejected', async () => {
  assert.equal((await checkGeminiIdentity(request({}, token, 'text/plain'), environment(), now)).status, 415);
  assert.equal((await checkGeminiIdentity(request({ nonce, proof: proof(key), candidateKey: key }), environment(), now)).status, 400);
  assert.equal((await checkGeminiIdentity(request({ data: 'x'.repeat(600) }), environment(), now)).status, 413);
});
test('missing key fails closed and fallback respects actual app precedence', async () => {
  assert.equal((await checkGeminiIdentity(request(), environment({ GOOGLE_GENERATIVE_AI_API_KEY: '' }), now)).status, 503);
  const fallback = await checkGeminiIdentity(request(), environment({ GOOGLE_GENERATIVE_AI_API_KEY: undefined, GEMINI_API_KEY: key }), now);
  assert.equal((await fallback.json()).match, true);
  const primaryWins = await checkGeminiIdentity(request({ nonce, proof: proof('fallback') }), environment({ GEMINI_API_KEY: 'fallback' }), now);
  assert.equal((await primaryWins.json()).match, false);
});
test('invalid JSON activation stays hidden', async () => {
  for (const value of ['null', '{}', 'not-json']) {
    assert.equal((await checkGeminiIdentity(request(), environment({ GEMINI_IDENTITY_PROBE_CONFIG: value }), now)).status, 404);
  }
});
