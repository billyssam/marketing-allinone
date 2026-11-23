import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushToOwner, type PushSub } from './push.js';

const point = createECDH('prime256v1').generateKeys().toString('base64url');
const endpoint = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;
const sub = (id: string): PushSub => ({ endpoint: endpoint(id), keys: { p256dh: point, auth: Buffer.alloc(16, 1).toString('base64url') } });
test('만료 기기 둘을 함께 제거하고 발송 중 등록한 기기와 metadata는 보존한다', async () => {
  let reads = 0;
  let saved: any;
  const client = { auth: { admin: {
    getUserById: async () => ({ data: { user: { user_metadata: { preference: 'keep', push_subs: (++reads === 1 ? ['gone-1', 'gone-2', 'live'] : ['gone-1', 'gone-2', 'live', 'new']).map(sub) } } }, error: null }),
    updateUserById: async (_id: string, patch: any) => { saved = patch; return { error: null }; },
  } } } as unknown as SupabaseClient;
  const result = await pushToOwner(client, 'owner', { title: 'draft', body: 'ready' }, async subscription => {
    if (subscription.endpoint.includes('/gone-')) throw { statusCode: 410 };
    return {} as any;
  });
  assert.deepEqual(result, { sent: 1, gone: 2, failed: 0 });
  assert.deepEqual(saved.user_metadata.push_subs.map((x: PushSub) => x.endpoint), ['live', 'new'].map(endpoint));
  assert.equal(saved.user_metadata.preference, 'keep');
});
test('구독 조회 실패를 구독 없음으로 위장하지 않는다', async () => {
  const client = { auth: { admin: { getUserById: async () => ({ data: {}, error: { message: 'failed' } }) } } } as unknown as SupabaseClient;
  await assert.rejects(pushToOwner(client, 'owner', { title: 'draft', body: 'ready' }));
});
test('503 전달 실패는 구독을 삭제하지 않고 실패로 반환한다', async () => {
  const client = { auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { push_subs: [sub('live')] } } }, error: null }) } } } as unknown as SupabaseClient;
  assert.deepEqual(await pushToOwner(client, 'owner', { title: 'draft', body: 'ready' }, async () => { throw { statusCode: 503 }; }), { sent: 0, gone: 0, failed: 1 });
});

test('사용자가 metadata에 직접 주입한 내부 주소와 잘못된 키는 발송하지 않는다', async () => {
  const unsafe = [null, { ...sub('local'), endpoint: 'https://127.0.0.1/internal' },
    { ...sub('fake'), endpoint: 'https://fcm.googleapis.com.attacker.test/collect' },
    { ...sub('bad-key'), keys: { p256dh: point, auth: 'invalid' } }];
  const client = { auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { push_subs: unsafe } } } }) } } } as unknown as SupabaseClient;
  let attempts = 0;
  assert.deepEqual(await pushToOwner(client, 'owner', { title: 'draft', body: 'ready' }, async () => { attempts++; }),
    { sent: 0, gone: 0, failed: 4 });
  assert.equal(attempts, 0);
});

test('metadata로 저장 제한을 우회해도 한 기기에 중복 발송하거나 5기기보다 많이 보내지 않는다', async () => {
  const raw = [sub('one'), sub('one'), ...Array.from({ length: 8 }, (_, i) => sub(String(i)))];
  const client = { auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { push_subs: raw } } } }) } } } as unknown as SupabaseClient;
  const attempted: string[] = [];
  const result = await pushToOwner(client, 'owner', { title: 'draft', body: 'ready' }, async s => { attempted.push(s.endpoint); });
  assert.equal(result.sent, 5);
  assert.equal(new Set(attempted).size, 5);
  assert.equal(result.failed, 4);
});
