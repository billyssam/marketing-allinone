import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleContentClient, DEFAULT_TEXT_MODEL, DEFAULT_SHORT_FORM_MODEL } from '../../shared/content-engine/google-client';

test('readiness follows every model page and uses the same API version as generation', async (t) => {
  const requests: { url: URL; method: string; body?: Record<string, any> }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.pathname.endsWith(':generateContent')) {
      return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: '가상 응답' }] } }] });
    }
    if (url.searchParams.get('pageToken')) {
      return Response.json({ models: [{ name: `models/${DEFAULT_SHORT_FORM_MODEL}`, supportedGenerationMethods: ['generateContent'] }] });
    }
    return Response.json({
      models: [{ name: `models/${DEFAULT_TEXT_MODEL}`, supportedGenerationMethods: ['generateContent'] }],
      nextPageToken: 'qa-next-page',
    });
  });
  const client = new GoogleContentClient('qa-key');
  assert.deepEqual(await client.unavailableModels([DEFAULT_TEXT_MODEL, DEFAULT_SHORT_FORM_MODEL]), []);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.method === 'GET'));
  const result = await client.getGenerativeModel({
    model: DEFAULT_TEXT_MODEL, systemInstruction: '가상 지침', generationConfig: { responseMimeType: 'application/json' },
  }).generateContent('가상 입력');
  assert.equal(result.response.text(), '가상 응답');
  assert.equal(requests[0].url.pathname.split('/')[1], requests[2].url.pathname.split('/')[1]);
  assert.equal(requests[2].url.pathname, `/v1beta/models/${DEFAULT_TEXT_MODEL}:generateContent`);
  assert.equal(requests[2].body?.systemInstruction.parts[0].text, '가상 지침');
  assert.equal(requests[2].body?.generationConfig.responseMimeType, 'application/json');
  assert.equal(requests[1].url.searchParams.get('pageToken'), 'qa-next-page');
});

test('readiness requires generateContent support for both primary and fallback models', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ models: [
    { name: `models/${DEFAULT_TEXT_MODEL}`, supportedGenerationMethods: ['generateContent'] },
    { name: `models/${DEFAULT_SHORT_FORM_MODEL}`, supportedGenerationMethods: ['countTokens'] },
  ] }));
  assert.deepEqual(await new GoogleContentClient('qa-key').unavailableModels([
    DEFAULT_TEXT_MODEL, DEFAULT_SHORT_FORM_MODEL, `models/${DEFAULT_SHORT_FORM_MODEL}`,
  ]), [DEFAULT_SHORT_FORM_MODEL]);
});

test('a failed model lookup never reports the AI connection as ready', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: { message: 'QA permission denied', code: 403 } }, { status: 403 });
  });
  await assert.rejects(new GoogleContentClient('qa-key').unavailableModels([DEFAULT_TEXT_MODEL]));
  assert.equal(calls, 1);
});
