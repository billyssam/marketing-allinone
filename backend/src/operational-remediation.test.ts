import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { channelsRoute } from './routes/channels';
import { safeDraftHtml } from '../../shared/safe-html';
import { reserveGeneration, reserveOnboarding, GenerationReservationError } from '../../shared/generation-reservation';
import { persistDrafts } from '../../web/src/lib/posts';
import type { ChannelDraftBundle } from '../../shared/content-engine/orchestrator';
import { settingsInput } from '../../shared/store-input';
import { generationInput } from '../../shared/generation-input';
import { instagramAdapter } from './channels/instagram';
import { sameOriginRequest } from '../../shared/request-origin';
import { compatibleExtension } from '../../shared/extension-version';

test('retired mutation routes reject anonymous credential injection without provider calls', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected provider call'); });
  for (const operation of ['connect', 'publish']) {
    const result = await channelsRoute.request(`/instagram/${operation}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conn: { accessToken: 'qa', externalId: '123' } }),
    });
    assert.equal(result.status, 410);
  }
  assert.equal(calls, 0);
});

test('Origin checks accept the real proxy host and reject missing, external and malformed origins', () => {
  const request = (origin: string, extra: Record<string, string> = {}) => new Request('http://localhost:3105/api/prepare', {
    headers: { host: '127.0.0.1:3105', origin, ...extra },
  });
  assert.equal(sameOriginRequest(request('http://127.0.0.1:3105')), true);
  assert.equal(sameOriginRequest(request('https://marketing-allinone.vercel.app', { host: 'marketing-allinone.vercel.app', 'x-forwarded-proto': 'https' })), true);
  for (const origin of ['null', 'https://evil.test', 'http://127.0.0.1:3105/path', 'http://127.0.0.1:3105.evil.test']) {
    assert.equal(sameOriginRequest(request(origin)), false);
  }
  assert.equal(sameOriginRequest(new Request('http://localhost/api/prepare')), false);
});

test('old extension builds cannot receive automatic draft handoffs', () => {
  for (const version of [undefined, '', '0.5.1', 'bad', '0.4.99']) assert.equal(compatibleExtension(version), false);
  for (const version of ['0.5.2', '0.5.3', '0.6.0', '1.0.0']) assert.equal(compatibleExtension(version), true);
});

test('HTML parsing removes active content and dangerous URLs while preserving safe formatting', () => {
  const html = '<p onclick="alert(1)">한글 &amp; 안내<strong>강조</strong></p><svg onload="alert(2)"></svg>' +
    '<script>alert(3)</script><img src=x onerror=alert(4)><a href="jav&#x61;script:alert(5)">링크</a>' +
    '<a href="https://example.com/guide">안내</a>';
  const safe = safeDraftHtml(html);
  assert.doesNotMatch(safe, /onclick|onerror|onload|<svg|<script|<img|javascript|alert\(/i);
  assert.match(safe, /<strong>강조<\/strong>/);
  assert.match(safe, /href="https:\/\/example.com\/guide"/);
  assert.equal(safeDraftHtml(safe), safe);
});

function bundle(body = '오늘 준비한 메뉴와 이용 방법을 확인해주세요. '.repeat(50)): ChannelDraftBundle {
  return { master: { title: '오늘의 안내', bodyHtml: `<p>${body}</p>`, tags: [], suggestedPhotoOrder: [] },
    perChannel: { naver_blog: { title: '오늘의 안내', bodyPlain: body, bodyHtml: `<p>${body}</p>` },
      instagram: { bodyPlain: body } }, channels: ['naver_blog', 'instagram'], degraded: true, salvaged: null };
}
test('draft persistence never retries a failed batch as silent partial success', async () => {
  let inserts = 0;
  const db = { from: () => ({ insert: () => { inserts++; return { select: async () => ({ data: null, error: { message: 'qa failure' } }) }; } }) };
  await assert.rejects(persistDrafts(db as unknown as SupabaseClient, 'store', bundle()), /모두 저장/);
  assert.equal(inserts, 1);
});
test('empty drafts never reach the database; recovered/degraded drafts retain review metadata', async () => {
  let rows: any[] = [];
  const db = { from: () => ({ insert: (input: any[]) => { rows = input; return { select: async () => ({
    data: input.map((row, i) => ({ ...row, id: String(i) })), error: null,
  }) }; } }) };
  await assert.rejects(persistDrafts(db as unknown as SupabaseClient, 'store', bundle('')), /비어/);
  assert.equal(rows.length, 0);
  const recovered = bundle(); recovered.salvaged = 'truncated';
  await persistDrafts(db as unknown as SupabaseClient, 'store', recovered);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].metadata.degraded, true);
  assert.equal(rows[0].metadata.salvaged, 'truncated');
  assert.equal(rows[0].metadata.reviewRequired, true);
  assert.equal(rows[0].status, 'draft');
});

function reservationDb() {
  const rows = new Map<string, any>();
  return { from(table: string): any {
    if (table === 'stores') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { owner_id: 'owner' }, error: null }) }) }) };
    return {
      insert: async (row: any) => {
        if (rows.has(row.id)) return { error: { code: '23505' } };
        rows.set(row.id, row); return { error: null };
      },
      delete: () => {
        const filters: Array<(row: any) => boolean> = [];
        const query: any = {
          eq: (field: string, value: any) => { filters.push((row) => (field === 'detail->>requestId' ? row.detail.requestId : row[field]) === value); return query; },
          lt: (field: string, value: any) => { filters.push((row) => row[field] < value); return query; },
          then: (resolve: any, reject: any) => {
            for (const [id, row] of rows) if (filters.every((filter) => filter(row))) rows.delete(id);
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        }; return query;
      },
    };
  } } as unknown as SupabaseClient;
}
test('distributed reservations serialize requests, cap all attempts at eight and reset by KST day', async () => {
  const db = reservationDb(); const now = Date.parse('2026-11-12T03:00:00Z');
  const simultaneous = await Promise.allSettled(Array.from({ length: 20 }, () => reserveGeneration(db, 'one', now)));
  const accepted = simultaneous.filter((result) => result.status === 'fulfilled');
  assert.equal(accepted.length, 1);
  for (const result of simultaneous) if (result.status === 'rejected') assert.equal(result.reason.status, 409);
  await (accepted[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveGeneration>>>).value.release();
  for (let i = 1; i < 8; i++) { const lease = await reserveGeneration(db, 'one', now); await lease.release(); }
  await assert.rejects(reserveGeneration(db, 'one', now), (e: unknown) => e instanceof GenerationReservationError && e.status === 429);
  const other = await reserveGeneration(db, 'other', now); await other.release();
  const tomorrow = await reserveGeneration(db, 'one', now + 86400000); await tomorrow.release();
});

test('onboarding locks reject concurrent registration and allow retry after release', async () => {
  const db = reservationDb();
  const first = await reserveOnboarding(db, 'owner');
  await assert.rejects(reserveOnboarding(db, 'owner'), (e: unknown) => e instanceof GenerationReservationError && e.status === 409);
  await first();
  const retry = await reserveOnboarding(db, 'owner'); await retry();
});

test('server DTOs reject invalid channel, large input and invalid prices; empty optional rows remain usable', () => {
  const store = { name: '가상점', industryId: 'cafe' };
  for (const price of [-1, Infinity, NaN, 1000000001]) {
    assert.equal(settingsInput.safeParse({ ...store, offerings: [{ name: '메뉴', price }] }).success, false);
  }
  assert.deepEqual(settingsInput.parse({ ...store, offerings: [{ name: '' }] }).offerings, []);
  for (const input of [{ channels: ['bad'] }, { angle: 'a'.repeat(2001) }, { photos: Array(13).fill({ storagePath: 'qa' }) }]) {
    assert.equal(generationInput.safeParse(input).success, false);
  }
  assert.deepEqual(generationInput.parse({ channels: ['instagram', 'instagram'] }).channels, ['instagram']);
});

test('Instagram resolves the official permalink and does not duplicate body hashtags', async (t) => {
  const bodies: any[] = []; let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return Response.json([{ id: '111' }, { id: '222' }, { permalink: 'https://www.instagram.com/p/real-code/' }][calls++]);
  });
  const result = await instagramAdapter.publish({ channelId: 'instagram', storeId: 'qa', status: 'connected',
    externalId: '123', accessToken: 'qa' }, { bodyPlain: '안내 #메뉴', tags: ['메뉴', '#메뉴'], images: [{ url: 'https://example.com/qa.jpg' }] });
  assert.equal(result.externalUrl, 'https://www.instagram.com/p/real-code/');
  assert.equal(bodies[0].caption, '안내 #메뉴');
  assert.equal(bodies[0].access_token, undefined);
  assert.equal(calls, 3);
});
