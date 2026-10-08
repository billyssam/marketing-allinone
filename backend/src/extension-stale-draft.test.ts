import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../extension/background.js', import.meta.url), 'utf8');
test('확장 초안은 30분 만료·잘못된 시간·미등록 시 다른 글쓰기 화면에서 재사용하지 않는다', async () => {
  for (const savedAt of [new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'invalid', undefined]) {
    let removed = false;
    const draft = { title: '예전 가상 초안', savedAt };
    const context = { chrome: {
      runtime: { onInstalled: { addListener() {} }, onMessageExternal: { addListener() {} }, onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({ currentDraft: draft }), remove: async () => { removed = true; } } },
    } };
    const result = await runInNewContext(source + '\ngetDraft()', context);
    assert.equal(result, null);
    assert.equal(removed, true);
  }
});
test('현재 전송한 가상 초안은 만료 전 읽을 수 있다', async () => {
  const draft = { title: '현재 가상 초안', savedAt: new Date().toISOString() };
  const context = { chrome: {
    runtime: { onInstalled: { addListener() {} }, onMessageExternal: { addListener() {} }, onMessage: { addListener() {} } },
    storage: { local: { get: async () => ({ currentDraft: draft }), remove: async () => { throw Error('새 초안 삭제 금지'); } } },
  } };
  assert.equal(await runInNewContext(source + '\ngetDraft()', context), draft);
});
