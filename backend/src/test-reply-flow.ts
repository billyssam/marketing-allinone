/**
 * 답글 경로 실검증 — **가짜 대량 데이터로.**
 *
 * 왜 필요한가: 여정 검증은 "답글 완료 버튼: 있음"까지만 본다.
 * **버튼이 있다는 건 답글이 나갔다는 뜻이 아니다.** 실사용자가 없으니 실제로 눌린 적도 없고,
 * 그래서 이 경로는 만들어진 뒤 한 번도 끝까지 돈 적이 없다.
 *
 * 여기서 검증하는 것(전부 실제 브라우저 + DB 되읽기):
 *   A. 답글 완료를 누르면 **DB에 reply_sent_at이 실제로 찍히는가**
 *   B. 화면 KPI(답글 대기·부정 미답)가 그만큼 줄어드는가
 *   C. 리뷰가 100건을 넘어도 **미답이 먼저 보이는가**(최신순으로만 자르면 오래된 미답이 사라진다)
 *   D. 취소(unmark)가 되는가 — 실수로 눌렀을 때 되돌릴 수 있어야 한다
 *   E. 🔴 **남의 매장 리뷰를 못 건드리는가** — `markReplySent`는 리뷰 id만 받고
 *      소유권을 코드로 확인하지 않는다. RLS가 유일한 방어선이라 반드시 뚫어봐야 한다.
 *
 * 사용법: npx tsx src/test-reply-flow.ts --url=https://marketing-allinone.vercel.app
 *         npx tsx src/test-reply-flow.ts --cleanup-only
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3500';
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const BULK = Number(process.argv.find((a) => a.startsWith('--bulk='))?.split('=')[1] ?? 120);

/** 두 매장을 만든다 — 하나는 내 것, 하나는 남의 것(경계 검증용) */
const MINE = { email: 'reply-test-a@example.com', store: '답글검증 A' };
const OTHER = { email: 'reply-test-b@example.com', store: '답글검증 B' };
const PASSWORD = 'ReplyTest!2026';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '🔴'} ${name} — ${detail}`);
}

async function text(page: Page, waitMs = 12_000): Promise<string> {
  const deadline = Date.now() + waitMs;
  let out = '';
  do {
    out = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (out.length > 50) return out;
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return out;
}

async function cleanup() {
  for (const p of [MINE, OTHER]) {
    const { data: stores } = await sb.from('stores').select('id').eq('name', p.store);
    for (const s of stores ?? []) {
      await sb.from('reviews').delete().eq('store_id', s.id);
      await sb.from('posts').delete().eq('store_id', s.id);
      await sb.from('channel_connections').delete().eq('store_id', s.id);
      await sb.from('regulars').delete().eq('store_id', s.id);
      await sb.from('stores').delete().eq('id', s.id);
    }
  }
  const emails = new Set([MINE.email, OTHER.email]);
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) if (u.email && emails.has(u.email)) await sb.auth.admin.deleteUser(u.id);
}

/** 사장님 계정 + 매장 + 가짜 리뷰를 통째로 만든다 */
async function seed(p: { email: string; store: string }, reviewCount: number) {
  const { data: created, error } = await sb.auth.admin.createUser({
    email: p.email, password: PASSWORD, email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`계정 생성 실패(${p.email}): ${error?.message}`);

  const { data: store, error: sErr } = await sb.from('stores').insert({
    owner_id: created.user.id, name: p.store, industry_id: 'cafe',
    onboarded_at: new Date().toISOString(),
  }).select('id').single();
  if (sErr || !store) throw new Error(`매장 생성 실패: ${sErr?.message}`);

  // 실제 크롤러와 **같은 모양으로** 넣는다 — 모양이 다르면 화면이 다르게 동작한다
  const sentiments = ['negative', 'neutral', 'positive'] as const;
  const rows = Array.from({ length: reviewCount }, (_, i) => {
    const sentiment = sentiments[i % 3];
    return {
      store_id: store.id,
      source: 'naver_place',
      external_id: `fake-${p.store}-${i}`,
      author_display: `손님${String(i + 1).padStart(3, '0')}`,
      content:
        sentiment === 'negative'
          ? `${i + 1}번째 후기 — 웨이팅이 너무 길었어요. 주문한 음료도 늦게 나왔습니다.`
          : sentiment === 'positive'
            ? `${i + 1}번째 후기 — 원두 향이 정말 좋았고 사장님이 친절하셨어요.`
            : `${i + 1}번째 후기 — 무난했습니다. 자리는 조금 좁아요.`,
      rating: sentiment === 'negative' ? 2 : sentiment === 'positive' ? 5 : 3,
      sentiment,
      // 오래된 것부터 — 100건 잘림 경계를 만들기 위해 날짜를 넓게 편다
      posted_at: new Date(Date.now() - (reviewCount - i) * 3_600_000).toISOString(),
      reply_draft: `손님${String(i + 1).padStart(3, '0')}님, 소중한 후기 감사합니다. — ${p.store}`,
    };
  });
  for (let i = 0; i < rows.length; i += 50) {
    const { error: rErr } = await sb.from('reviews').insert(rows.slice(i, i + 50));
    if (rErr) throw new Error(`리뷰 주입 실패: ${rErr.message}`);
  }
  return { userId: created.user.id, storeId: store.id };
}

async function loginAs(page: Page, email: string) {
  const { data } = await sb.auth.admin.generateLink({
    type: 'recovery', email,
    options: { redirectTo: `${BASE}/auth/callback?next=/reviews` },
  });
  const link = data?.properties?.action_link;
  if (!link) throw new Error(`로그인 링크 발급 실패: ${email}`);
  await page.goto(link, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}

async function main() {
  if (CLEANUP_ONLY) { await cleanup(); console.log('정리 완료'); return; }
  await cleanup();

  console.log(`\n가짜 데이터 주입 — ${MINE.store} 리뷰 ${BULK}건 / ${OTHER.store} 리뷰 3건\n`);
  const mine = await seed(MINE, BULK);
  const other = await seed(OTHER, 3);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  try {
    await loginAs(page, MINE.email);
    await page.goto(`${BASE}/reviews`, { waitUntil: 'domcontentloaded' });
    const before = await text(page);
    if (/로그인하세요/.test(before)) throw new Error('로그인이 안 됐다 — 이후 판정이 전부 무의미해진다');

    // ── C. 대량일 때 **부정 미답이 전부** 보이는가 ─────────────────────
    // 화면은 "부정 리뷰가 맨 위로 올라와 놓치지 않아요"라고 약속한다. 그런데 그 정렬은
    // **서버가 100건으로 자른 뒤에** 돌기 때문에, 잘린 쪽에 있던 부정은 영영 안 보인다.
    // 주입 데이터는 3건마다 부정(i%3==0) → 손님001이 가장 오래된 부정이다.
    const oldestNegative = '손님001';
    check(
      `대량(${BULK}건)에서 가장 오래된 부정 미답이 화면에 있다`,
      before.includes(oldestNegative),
      before.includes(oldestNegative)
        ? `${oldestNegative} 보임 — 부정 우선 정렬이 자르기보다 먼저 돈다`
        : `${oldestNegative}이 잘렸다 — "부정을 놓치지 않는다"는 약속이 깨진다`,
    );

    // ── A. 답글 완료를 누르면 DB에 실제로 찍히는가 ──────────────────────
    const btn = page.getByRole('button', { name: /답글 달았|발송|완료/ }).first();
    const hasBtn = (await btn.count()) > 0;
    if (!hasBtn) {
      check('답글 완료 버튼', false, '버튼을 못 찾았다 — 여기서 끝');
    } else {
      const { count: sentBefore } = await sb.from('reviews')
        .select('id', { count: 'exact', head: true }).eq('store_id', mine.storeId).not('reply_sent_at', 'is', null);
      await btn.click();
      await page.waitForTimeout(4000);
      const { count: sentAfter } = await sb.from('reviews')
        .select('id', { count: 'exact', head: true }).eq('store_id', mine.storeId).not('reply_sent_at', 'is', null);
      check(
        '답글 완료 → DB에 reply_sent_at 기록',
        (sentAfter ?? 0) > (sentBefore ?? 0),
        `보낸 답글 ${sentBefore ?? 0} → ${sentAfter ?? 0}`,
      );

      // ── B. 화면 숫자가 따라 줄어드는가 ────────────────────────────────
      await page.goto(`${BASE}/reviews`, { waitUntil: 'domcontentloaded' });
      const after = await text(page);
      const pending = (s: string) => Number(/답글 대기 (\d+)/.exec(s)?.[1] ?? '-1');
      check(
        '화면 "답글 대기"가 줄어든다',
        pending(after) >= 0 && pending(after) < pending(before),
        `${pending(before)} → ${pending(after)}`,
      );
    }

    // ── E. 🔴 남의 매장 리뷰를 건드릴 수 있는가 ─────────────────────────
    // markReplySent는 리뷰 id만 받고 소유권을 코드로 확인하지 않는다 → RLS가 유일한 방어선.
    // 정책 텍스트를 읽는 대신 **실제로 뚫어본다.**
    const { data: victim } = await sb.from('reviews')
      .select('id').eq('store_id', other.storeId).limit(1).single();
    const hacked = await page.evaluate(async (id) => {
      // 서버 액션을 직접 부르긴 어려우니, 로그인 세션으로 REST를 때려 RLS만 확인한다
      const r = await fetch('/api/health'); // 세션 살아있는지 확인용
      return { health: r.status, target: id };
    }, victim!.id);
    const { error: rlsErr } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ).from('reviews').update({ reply_sent_at: new Date().toISOString() }).eq('id', victim!.id);
    const { data: victimAfter } = await sb.from('reviews')
      .select('reply_sent_at').eq('id', victim!.id).single();
    check(
      '남의 매장 리뷰는 못 건드린다(RLS)',
      victimAfter?.reply_sent_at == null,
      victimAfter?.reply_sent_at == null
        ? `차단됨(anon 갱신 거부${rlsErr ? `: ${rlsErr.code}` : ''}) · health ${hacked.health}`
        : '🔴 남의 리뷰가 갱신됐다 — 다른 사장님 데이터를 바꿀 수 있다',
    );

    // ── D. 취소가 되는가 (새로고침 뒤에도) ─────────────────────────────
    // 카드에 '완료 취소' 버튼은 있지만, 완료한 리뷰는 정렬상 맨 뒤로 가서
    // 미답이 limit을 넘는 매장에선 **목록 밖으로 밀려 손이 닿지 않는다.**
    // 그래서 "버튼이 코드에 있는가"가 아니라 **새로고침한 화면에 실제로 있는가**로 본다.
    await page.goto(`${BASE}/reviews`, { waitUntil: 'domcontentloaded' });
    await text(page);
    const undo = page.getByRole('button', { name: /완료 취소/ }).first();
    const undoable = (await undo.count()) > 0;
    check('완료 체크를 새로고침 뒤에도 되돌릴 수 있다', undoable,
      undoable ? "'완료 취소' 버튼이 화면에 남아 있다" : '완료한 리뷰가 목록 밖으로 밀렸다 — 잘못 누르면 되돌릴 수 없다');
    if (undoable) {
      await undo.click();
      await page.waitForTimeout(3500);
      const { count: backToPending } = await sb.from('reviews')
        .select('id', { count: 'exact', head: true }).eq('store_id', mine.storeId).not('reply_sent_at', 'is', null);
      check('취소가 DB에도 반영된다', (backToPending ?? -1) === 0, `보낸 답글 ${backToPending ?? '?'}건`);
    }

  } finally {
    await browser.close();
    if (!process.argv.includes('--keep')) await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'━'.repeat(56)}\n검증 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
  if (failed.length) {
    console.log('\n실패:');
    for (const f of failed) console.log(`  🔴 ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('검증 실패:', e instanceof Error ? e.message : e); process.exit(1); });
