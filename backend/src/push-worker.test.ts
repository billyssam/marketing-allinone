import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const origin = 'https://marketing-allinone.vercel.app';
function worker(clients: unknown = { matchAll: async () => [], openWindow: async () => undefined }) {
  const handlers: Record<string, (event: any) => void> = {};
  const shown: any[] = [];
  runInNewContext(readFileSync(new URL('../../web/public/sw.js', import.meta.url), 'utf8'), {
    URL, fetch: () => { throw new Error('No external fetch allowed in this regression'); },
    self: { location: { origin }, addEventListener: (type: string, cb: any) => { handlers[type] = cb; },
      registration: { showNotification: async (title: string, options: unknown) => { shown.push({ title, options }); } }, clients },
  });
  return { handlers, shown };
}

test('null·문자열·잘못된 JSON 푸시도 표시 가능한 기본 알림으로 처리한다', async () => {
  for (const value of [null, 'text', 123, []]) {
    const w = worker(); let pending: Promise<unknown> | undefined;
    w.handlers.push({ data: { json: () => value }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
    assert.equal(w.shown.length, 1);
    assert.equal(w.shown[0].title, '마케팅올인원');
    assert.equal(w.shown[0].options.data.url, origin + '/dashboard');
  }
  const w = worker(); let pending: Promise<unknown> | undefined;
  w.handlers.push({ data: { json: () => { throw Error('invalid JSON'); }, text: () => 'legacy text' }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending; assert.equal(w.shown[0].options.body, 'legacy text');
});

test('알림 클릭은 외부 도메인·스크립트·위조 호스트로 이동하지 않는다', async () => {
  for (const url of ['https://attacker.test/', '//attacker.test/', 'javascript:alert(1)', 'data:text/html,test',
    'https://marketing-allinone.vercel.app.attacker.test/dashboard']) {
    const opened: string[] = [];
    const w = worker({ matchAll: async () => [], openWindow: async (u: string) => { opened.push(u); } });
    let pending: Promise<unknown> | undefined;
    w.handlers.notificationclick({ notification: { data: { url }, close() {} }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending; assert.deepEqual(opened, [origin + '/dashboard']);
  }
});

test('주소 일부만 같은 탭 대신 정확한 초안 주소를 탐색하고 포커스한다', async () => {
  const target = origin + '/posts/qa-draft'; const navigations: string[] = []; let focuses = 0;
  const own = { url: origin + '/dashboard?next=' + target, navigate: async (url: string) => { navigations.push(url); return own; }, focus: async () => { focuses++; } };
  const w = worker({ matchAll: async () => [own], openWindow: async () => { throw Error('Reuse the existing app tab'); } });
  let pending: Promise<unknown> | undefined;
  w.handlers.notificationclick({ notification: { data: { url: '/posts/qa-draft' }, close() {} }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending; assert.deepEqual(navigations, [target]); assert.equal(focuses, 1);
});

test('기존 탭 탐색 실패 시 같은 사이트의 목적지로 새 창을 연다', async () => {
  const opened: string[] = [];
  const w = worker({ matchAll: async () => [{ url: origin + '/dashboard', navigate: async () => { throw Error('closed tab'); }, focus() {} }], openWindow: async (u: string) => { opened.push(u); } });
  let pending: Promise<unknown> | undefined;
  w.handlers.notificationclick({ notification: { data: { url: '/posts/qa-draft' }, close() {} }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending; assert.deepEqual(opened, [origin + '/posts/qa-draft']);
});
