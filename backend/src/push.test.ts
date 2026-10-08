import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushToOwner, type PushSub } from './push.js';

const sub = (endpoint: string): PushSub => ({ endpoint, keys: { p256dh: 'x', auth: 'y' } });
test('만료 기기 둘을 함께 제거하고 발송 중 등록한 기기와 metadata는 보존한다', async () => {
  let reads = 0;
  let saved: any;
  const client = { auth: { admin: {
    getUserById: async () => ({ data: { user: { user_metadata: { preference: 'keep', push_subs: (++reads === 1 ? ['gone-1', 'gone-2', 'live'] : ['gone-1', 'gone-2', 'live', 'new']).map(sub) } } }, error: null }),
    updateUserById: async (_id: string, patch: any) => { saved = patch; return { error: null }; },
  } } } as unknown as SupabaseClient;
  const result = await pushToOwner(client, 'owner', { title: 'draft', body: 'ready' }, async subscription => {
    if (subscription.endpoint.startsWith('gone')) throw { statusCode: 410 };
    return {} as any;
  });
  assert.deepEqual(result, { sent: 1, gone: 2, failed: 0 });
  assert.deepEqual(saved.user_metadata.push_subs.map((x: PushSub) => x.endpoint), ['live', 'new']);
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
