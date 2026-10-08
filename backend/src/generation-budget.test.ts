import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiClient } from '../../shared/content-engine/gemini-client';
import type { DraftInput } from '../../shared/content-engine/types';

test('기획 요청과 한도 폴백 모두 응답 토큰 상한을 유지한다', async (t) => {
  const limits: number[] = [];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const parameters = JSON.parse(String(init.body)) as { generationConfig?: { maxOutputTokens?: number } };
    limits.push(parameters.generationConfig?.maxOutputTokens ?? 0);
    if (++calls === 1) return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '가상 기획 응답' }] } }] }), { status: 200 });
  });
  const client = createGeminiClient({ apiKey: 'qa-test-key' });
  await client.planOnly({ store: { id: 'qa', name: '가상 카페', industryId: 'cafe', brandTone: {} }, photos: [] } as DraftInput);
  assert.deepEqual(limits, [8192, 8192]);
  assert.equal(client.usedFallback(), true);
});
