/**
 * 단골 · 주간 리포트 실검증 — **가짜 대량 데이터로.**
 *
 * 왜 필요한가: 여정 검증은 단골 0명·발행 0건 상태에서만 이 두 화면을 봤다.
 * "빈 화면이 잘 뜬다"는 건 **채워졌을 때 맞는다는 뜻이 아니다.**
 * 실사용자가 없어 아무도 채워본 적이 없으므로, 여기서 채워서 걸어본다.
 *
 * 검증하는 것(전부 실제 브라우저 + DB/규칙 대조):
 *   A. 단골 등급 경계(30일·60일)가 **화면 숫자와 규칙이 같은가**
 *      — `tierByDays`는 30 이하 active / 60 이하 fading / 그 외 inactive.
 *        경계값(29·30·31·59·60·61)을 일부러 심어 한 칸씩 밀리는지 본다.
 *   B. 방문일 미상(null)도 재방문 대상으로 세는가 — 규칙엔 있는데 화면이 빠뜨리기 쉽다.
 *   C. 단골이 500명을 넘으면 무엇이 사라지는가(목록 상한).
 *   D. 주간 리포트가 발행 이력 3개월치에서 **이번 주만** 세는가.
 *   E. 리포트 숫자가 DB 실측과 일치하는가 — 화면이 다른 걸 세면 신뢰가 깨진다.
 *
 * 사용법: npx tsx src/test-regulars-report.ts --url=https://marketing-allinone.vercel.app
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';
import { tierByDays, isReactivationTarget, daysSince } from '../../shared/content-engine/reactivation.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3500';
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const KEEP = process.argv.includes('--keep');

const OWNER = { email: 'regulars-test@example.com', store: '단골검증 매장' };
const PASSWORD = 'RegularsTest!2026';
const DAY = 86_400_000;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '🔴'} ${name} — ${detail}`);
}

async function text(page: Page, waitMs = 15_000): Promise<string> {
  const deadline = Date.now() + waitMs;
  let out = '';
  do {
    out = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (out.length > 50) return out;
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return out;
}

/** 화면에서 `라벨 숫자` 꼴을 읽는다. 못 읽으면 -1(판정에서 실패로 드러난다) */
function metric(screen: string, label: string): number {
  const m = new RegExp(`${label}\\s+([\\d,]+)`).exec(screen);
  return m ? Number(m[1].replace(/,/g, '')) : -1;
}

async function cleanup() {
  const { data: stores } = await sb.from('stores').select('id').eq('name', OWNER.store);
  for (const s of stores ?? []) {
    await sb.from('regulars').delete().eq('store_id', s.id);
    await sb.from('reviews').delete().eq('store_id', s.id);
    await sb.from('posts').delete().eq('store_id', s.id);
    await sb.from('channel_connections').delete().eq('store_id', s.id);
    await sb.from('stores').delete().eq('id', s.id);
  }
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) if (u.email === OWNER.email) await sb.auth.admin.deleteUser(u.id);
}

/** 경계를 정확히 찌르는 경과일 — 한 칸 밀림을 여기서 잡는다 */
const BOUNDARY_DAYS: (number | null)[] = [0, 29, 30, 31, 59, 60, 61, 120, null];

async function main() {
  if (CLEANUP_ONLY) { await cleanup(); console.log('정리 완료'); return; }
  await cleanup();

  const { data: created, error } = await sb.auth.admin.createUser({
    email: OWNER.email, password: PASSWORD, email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`계정 생성 실패: ${error?.message}`);
  const { data: store, error: sErr } = await sb.from('stores').insert({
    owner_id: created.user.id, name: OWNER.store, industry_id: 'cafe',
    onboarded_at: new Date().toISOString(),
  }).select('id').single();
  if (sErr || !store) throw new Error(`매장 생성 실패: ${sErr?.message}`);

  // ── 단골 주입: 경계값 + 대량 ──────────────────────────────────────
  const regulars = [
    ...BOUNDARY_DAYS.map((d, i) => ({
      store_id: store.id,
      name: `경계${i}_${d ?? 'null'}일`,
      phone: `0100000${String(i).padStart(4, '0')}`,
      last_visit_at: d == null ? null : new Date(Date.now() - d * DAY).toISOString().slice(0, 10),
      visit_count: 3,
      opted_in: true,
    })),
    // 대량 — 목록 상한(500) 경계를 넘긴다
    ...Array.from({ length: 520 }, (_, i) => ({
      store_id: store.id,
      name: `단골${String(i).padStart(4, '0')}`,
      phone: `0101${String(i).padStart(7, '0')}`,
      last_visit_at: new Date(Date.now() - ((i % 90) + 1) * DAY).toISOString().slice(0, 10),
      visit_count: (i % 9) + 1,
      opted_in: true,
    })),
  ];
  for (let i = 0; i < regulars.length; i += 100) {
    const { error: e } = await sb.from('regulars').insert(regulars.slice(i, i + 100));
    if (e) throw new Error(`단골 주입 실패: ${e.message}`);
  }

  // ── 발행 이력 주입: 3개월치(이번 주만 세는지 확인) ─────────────────
  // ⚠️ **실제 앱이 만들 수 있는 모양으로만** 넣는다.
  // 처음엔 90건 전부 `status:'published'`로 두고 `published_at`만 절반 비웠는데,
  // 앱은 두 값을 **항상 함께** 쓴다(`api/prepare/route.ts` 한 곳). 존재할 수 없는 상태를
  // 만들어 놓고 "리포트가 7/7이라고 거짓말한다"는 **가짜 결함**을 잡았다.
  // 있을 수 없는 입력으로 만든 실패는 결함이 아니라 내 실수다.
  const posts = Array.from({ length: 90 }, (_, i) => {
    const publishedThisDay = i % 2 === 0; // 이틀에 한 번 올린 사장님 → 이번 주 4일
    const at = new Date(Date.now() - i * DAY).toISOString();
    return {
      store_id: store.id,
      channel: 'blog',
      title: `${i}일 전 글`,
      body_html: `<p>${'가'.repeat(300)}</p>`,
      status: publishedThisDay ? 'published' : 'draft',
      created_at: at,
      published_at: publishedThisDay ? at : null,
    };
  });
  for (let i = 0; i < posts.length; i += 30) {
    const { error: e } = await sb.from('posts').insert(posts.slice(i, i + 30));
    if (e) throw new Error(`글 주입 실패: ${e.message}`);
  }

  console.log(`\n가짜 데이터 주입 — 단골 ${regulars.length}명(경계 ${BOUNDARY_DAYS.length}) · 글 ${posts.length}건(3개월)\n`);

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
      options: { redirectTo: `${BASE}/auth/callback?next=/regulars` },
    });
    await page.goto(link!.properties!.action_link, { waitUntil: 'domcontentloaded' });
    // 콜백이 스스로 /regulars 로 넘긴다 — 그 사이에 또 goto 하면 두 이동이 부딪혀 터진다
    await page.waitForURL(/\/regulars/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (!page.url().includes('/regulars')) {
      await page.goto(`${BASE}/regulars`, { waitUntil: 'domcontentloaded' });
    }
    const screen = await text(page);
    if (/로그인하세요/.test(screen)) throw new Error('로그인 실패 — 이후 판정이 무의미해진다');

    // ── A·B. 규칙과 화면이 같은 것을 세는가 ───────────────────────────
    // 규칙(`tierByDays`)으로 직접 센 값과 화면 숫자를 대조한다.
    // 화면이 다른 걸 세면 사장님은 "몇 명한테 보내야 하나"를 영영 모른다.
    const { data: all } = await sb.from('regulars')
      .select('last_visit_at').eq('store_id', store.id).limit(1000);
    // ⚠️ 여기서 날짜를 **직접 계산하지 않는다.** 처음엔 화면의 입력폼 코드를 베껴
    // `${v}T00:00:00+09:00`을 붙였는데, `last_visit_at`은 date가 아니라 **timestamptz**라
    // 이미 완전한 ISO 문자열이었다 → Date.parse가 NaN → 전원 'inactive'로 찍히고
    // "활성 0명"이라는 **가짜 결함**이 나왔다. 화면이 쓰는 함수를 그대로 쓴다.
    const now = Date.now();
    const days = (v: string | null) => daysSince(v, now);
    const expected = {
      active: (all ?? []).filter((r) => tierByDays(days(r.last_visit_at as string | null)) === 'active').length,
      inactive: (all ?? []).filter((r) => tierByDays(days(r.last_visit_at as string | null)) === 'inactive').length,
      targets: (all ?? []).filter((r) => isReactivationTarget(days(r.last_visit_at as string | null))).length,
      total: (all ?? []).length,
    };

    check('전체 단골 수가 DB와 같다', metric(screen, '전체 단골') === expected.total,
      `화면 ${metric(screen, '전체 단골')} vs DB ${expected.total}`);
    check('활성 수가 규칙(30일 이하)과 같다', metric(screen, '활성') === expected.active,
      `화면 ${metric(screen, '활성')} vs 규칙 ${expected.active}`);
    check('끊긴 단골 수가 규칙(60일 초과)과 같다', metric(screen, '끊긴 단골') === expected.inactive,
      `화면 ${metric(screen, '끊긴 단골')} vs 규칙 ${expected.inactive}`);
    check('재방문 대상 수가 규칙(미상 포함)과 같다', metric(screen, '재방문 대상') === expected.targets,
      `화면 ${metric(screen, '재방문 대상')} vs 규칙 ${expected.targets}`);

    // ── C. 목록 상한을 넘겼을 때 숫자가 거짓말하지 않는가 ───────────────
    // 목록은 500건만 가져온다. 그런데 KPI가 그 500건 표본으로 계산되면
    // "전체 단골 529명"인데 "활성 480명" 같은 **표본 기준 숫자**가 섞인다.
    check('KPI가 목록 표본(500)이 아니라 전체 기준이다',
      metric(screen, '전체 단골') === expected.total && expected.total > 500,
      `단골 ${expected.total}명(>500)에서 전체 단골=${metric(screen, '전체 단골')}`);

    // ── D·E. 주간 리포트 ──────────────────────────────────────────────
    await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
    const rep = await text(page);
    const { data: pubs } = await sb.from('posts')
      .select('published_at').eq('store_id', store.id).not('published_at', 'is', null);
    const weekDays = new Set(
      (pubs ?? [])
        .filter((p) => Date.now() - Date.parse(p.published_at as string) < 7 * DAY)
        .map((p) => new Date(Date.parse(p.published_at as string) + 9 * 3_600_000).toISOString().slice(0, 10)),
    ).size;
    check('리포트가 3개월치 중 이번 주만 센다',
      new RegExp(`올린 날\\s*${weekDays}\\b`).test(rep) || rep.includes(`${weekDays}/7`),
      `DB 기준 이번 주 올린 날 ${weekDays}일 · 화면: ${/올린 날[^·]{0,12}/.exec(rep)?.[0] ?? '표시 없음'}`);
    check('리포트가 빈 화면이 아니다', rep.length > 200 && !/오류|error/i.test(rep),
      `${rep.length}자`);

  } finally {
    await browser.close();
    if (!KEEP) await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'━'.repeat(56)}\n검증 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('검증 실패:', e instanceof Error ? e.message : e); process.exit(1); });
