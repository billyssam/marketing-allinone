/**
 * 대시보드 실검증 — **가짜 대량 데이터로.**
 *
 * 왜 필요한가: 대시보드는 지금까지 "가입 직후 0건" 상태에서만 검증됐다.
 * 실사용 몇 달치가 쌓였을 때 KPI·차트가 맞는지 **아무도 본 적이 없다.**
 *
 * 특히 의심하는 것: **보관된 초안(archived)**.
 * 데일리 크론은 같은 날 재생성하면 이전 초안을 `archived`로 밀어 둔다.
 * 그런데 대시보드의 posts 쿼리 5개에는 `archived` 제외가 **한 군데도 없다**
 * (`/posts` 화면만 '보관됨' 탭으로 따로 다룬다).
 * 그러면 사장님 화면에 **버린 글까지 얹은 숫자**가 뜬다.
 *
 * 검증:
 *   A. "생성한 글" KPI가 보관분을 빼고 세는가
 *   B. 주간 차트 합이 보관분을 빼고 세는가
 *   C. "최근 초안" 목록에 보관된 글이 섞이지 않는가 (누르면 이미 버린 글이다)
 *   D. "오늘 할 일"이 보관분을 세지 않는가
 *   E. 리뷰 KPI(긍정률)가 전체 집계와 같은가
 *
 * 사용법: npx tsx src/test-dashboard.ts --url=https://marketing-allinone.vercel.app
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3500';
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const KEEP = process.argv.includes('--keep');

const OWNER = { email: 'dash-test@example.com', store: '대시보드검증 매장' };
const PASSWORD = 'DashTest!2026';
const DAY = 86_400_000;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '🔴'} ${name} — ${detail}`);
}

async function text(page: Page, waitMs = 20_000): Promise<string> {
  const deadline = Date.now() + waitMs;
  let out = '';
  do {
    out = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (out.length > 200) return out;
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return out;
}

/** `라벨 숫자` 꼴을 읽는다. 못 읽으면 -1 */
function metric(screen: string, label: string): number {
  const m = new RegExp(`${label}\\s+([\\d,]+)`).exec(screen);
  return m ? Number(m[1].replace(/,/g, '')) : -1;
}

async function cleanup() {
  const { data: stores } = await sb.from('stores').select('id').eq('name', OWNER.store);
  for (const s of stores ?? []) {
    for (const t of ['posts', 'reviews', 'regulars', 'channel_connections']) {
      await sb.from(t).delete().eq('store_id', s.id);
    }
    await sb.from('stores').delete().eq('id', s.id);
  }
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) if (u.email === OWNER.email) await sb.auth.admin.deleteUser(u.id);
}

async function main() {
  if (CLEANUP_ONLY) { await cleanup(); console.log('정리 완료'); return; }
  await cleanup();

  const { data: created, error } = await sb.auth.admin.createUser({
    email: OWNER.email, password: PASSWORD, email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`계정 생성 실패: ${error?.message}`);
  const { data: store, error: sErr } = await sb.from('stores').insert({
    owner_id: created.user.id, name: OWNER.store, industry_id: 'cafe',
    onboarded_at: new Date(Date.now() - 30 * DAY).toISOString(),
  }).select('id').single();
  if (sErr || !store) throw new Error(`매장 생성 실패: ${sErr?.message}`);

  /**
   * 실제 크론이 만드는 모양 그대로:
   *  - 매일 2채널 초안이 나온다
   *  - 그중 일부 날은 **재생성**돼서 이전 초안이 `archived`로 남는다
   *  - 일부는 실제로 발행된다
   */
  const LIVE_PER_DAY = 2;
  const ARCHIVED_PER_REGEN_DAY = 2;
  const DAYS = 14;
  const REGEN_DAYS = new Set([0, 1, 3, 6]); // 이 날들은 재생성이 있었다
  const posts: Record<string, unknown>[] = [];
  for (let d = 0; d < DAYS; d++) {
    const at = new Date(Date.now() - d * DAY).toISOString();
    const publishedThisDay = d % 2 === 0;
    for (let c = 0; c < LIVE_PER_DAY; c++) {
      posts.push({
        store_id: store.id, channel: c === 0 ? 'blog' : 'instagram',
        title: `${d}일 전 살아있는 글${c}`, body_html: `<p>${'가'.repeat(200)}</p>`,
        status: publishedThisDay && c === 0 ? 'published' : 'draft',
        created_at: at, published_at: publishedThisDay && c === 0 ? at : null,
        metadata: { auto: 'daily' },
      });
    }
    if (REGEN_DAYS.has(d)) {
      for (let c = 0; c < ARCHIVED_PER_REGEN_DAY; c++) {
        posts.push({
          store_id: store.id, channel: c === 0 ? 'blog' : 'instagram',
          title: `${d}일 전 버린 글${c}`, body_html: `<p>${'나'.repeat(200)}</p>`,
          status: 'archived', created_at: at, published_at: null,
          metadata: { auto: 'daily' },
        });
      }
    }
  }
  for (let i = 0; i < posts.length; i += 30) {
    const { error: e } = await sb.from('posts').insert(posts.slice(i, i + 30));
    if (e) throw new Error(`글 주입 실패: ${e.message}`);
  }

  // 리뷰도 얹는다 — 긍정률 KPI가 전체 집계인지 본다
  const reviews = Array.from({ length: 150 }, (_, i) => ({
    store_id: store.id, source: 'naver_place', external_id: `dash-${i}`,
    author_display: `손님${i}`, content: `${i}번째 후기입니다. 잘 먹었습니다.`,
    rating: i % 5 === 0 ? 2 : 5,
    sentiment: i % 5 === 0 ? 'negative' : 'positive',
    posted_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    reply_draft: `손님${i}님 감사합니다.`,
  }));
  for (let i = 0; i < reviews.length; i += 50) {
    const { error: e } = await sb.from('reviews').insert(reviews.slice(i, i + 50));
    if (e) throw new Error(`리뷰 주입 실패: ${e.message}`);
  }

  const live = posts.filter((p) => p.status !== 'archived');
  const archived = posts.filter((p) => p.status === 'archived');
  console.log(`\n가짜 데이터 — 글 ${posts.length}건(살아있음 ${live.length} · 보관 ${archived.length}) · 리뷰 ${reviews.length}건\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  try {
    const { data: link } = await sb.auth.admin.generateLink({
      type: 'recovery', email: OWNER.email,
      options: { redirectTo: `${BASE}/auth/callback?next=/dashboard` },
    });
    await page.goto(link!.properties!.action_link, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (!page.url().includes('/dashboard')) await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    const screen = await text(page);
    if (/로그인하세요/.test(screen)) throw new Error('로그인 실패 — 이후 판정이 무의미');

    // ── A. "생성한 글"이 보관분을 빼는가 ──────────────────────────────
    check('"생성한 글"이 보관된 초안을 세지 않는다',
      metric(screen, '생성한 글') === live.length,
      `화면 ${metric(screen, '생성한 글')} vs 살아있는 글 ${live.length} (전체 ${posts.length})`);

    // ── B. 주간 차트 합이 보관분을 빼는가 ─────────────────────────────
    const weekLive = live.filter((p) => Date.now() - Date.parse(p.created_at as string) < 7 * DAY).length;
    const weekAll = posts.filter((p) => Date.now() - Date.parse(p.created_at as string) < 7 * DAY).length;
    const shownWeek = /이번 주 (\d+)건/.exec(screen)?.[1];
    check('"이번 주 N건"이 보관분을 세지 않는다',
      shownWeek != null && Number(shownWeek) === weekLive,
      `화면 ${shownWeek ?? '표시없음'} vs 살아있는 ${weekLive} (보관 포함이면 ${weekAll})`);

    // ── C. "최근 초안"에 버린 글이 섞이지 않는가 ───────────────────────
    check('"최근 초안" 목록에 보관된 글이 없다', !screen.includes('버린 글'),
      screen.includes('버린 글') ? '보관된 글이 목록에 보인다 — 누르면 이미 버린 글이다' : '보관분 없음');

    // ── D. "오늘 할 일"이 보관분을 세지 않는가 ─────────────────────────
    // 오늘 발행분이 있으면 글 할 일은 0이 되는 게 설계다 → 답글 대기만 남아야 한다
    const { count: pendingReplies } = await sb.from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id).not('reply_draft', 'is', null).is('reply_sent_at', null);
    check('"오늘 할 일"이 답글 대기 수와 어긋나지 않는다',
      metric(screen, '오늘 할 일') >= 0 && metric(screen, '오늘 할 일') <= (pendingReplies ?? 0) + 1,
      `화면 ${metric(screen, '오늘 할 일')} · 답글 대기 ${pendingReplies}`);

    // ── E. 리뷰 긍정률이 전체 집계인가 ────────────────────────────────
    const { count: total } = await sb.from('reviews')
      .select('id', { count: 'exact', head: true }).eq('store_id', store.id);
    const { count: pos } = await sb.from('reviews')
      .select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'positive');
    const expectedRate = Math.round(((pos ?? 0) / (total ?? 1)) * 100);
    check('리뷰 긍정률이 전체 집계와 같다',
      new RegExp(`리뷰 긍정률\\s+${expectedRate}\\b`).test(screen),
      `기대 ${expectedRate}% · 화면: ${/리뷰 긍정률[^·]{0,18}/.exec(screen)?.[0] ?? '표시없음'}`);

  } finally {
    await browser.close();
    if (!KEEP) await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'━'.repeat(56)}\n검증 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('검증 실패:', e instanceof Error ? e.message : e); process.exit(1); });
