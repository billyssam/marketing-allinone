/**
 * 채널 연결 화면 실검증 — **실데이터로 열어서.**
 *
 * 왜: 이 화면의 유일한 일은 "지금 뭘 하면 하나가 더 열리는가"에 답하는 것이다.
 * 그런데 그 답이 맞으려면 세 가지가 동시에 참이어야 한다 —
 * ①행동별로 묶여 있고 ②각 채널 실적이 DB와 같고 ③못 여는 건 이유가 적혀 있어야 한다.
 * 목업으로 보면 셋 다 통과한 것처럼 보인다(2026-09-08에 그렇게 데었다).
 *
 * 사용법: npx tsx src/test-channels-screen.ts --url=https://marketing-allinone.vercel.app
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3500';
const OWNER = { email: 'channels-test@example.com', store: '채널검증 매장' };
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
    if (out.length > 200) return out;
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return out;
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
  if (process.argv.includes('--cleanup-only')) { await cleanup(); console.log('정리 완료'); return; }
  await cleanup();

  const { data: created, error } = await sb.auth.admin.createUser({
    email: OWNER.email, password: 'ChanTest!2026', email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`계정 생성 실패: ${error?.message}`);
  const { data: store } = await sb.from('stores').insert({
    owner_id: created.user.id, name: OWNER.store, industry_id: 'cafe',
    onboarded_at: new Date().toISOString(),
  }).select('id').single();

  // 실적이 화면 숫자와 맞는지 보려고 **정확한 개수**를 심는다: 블로그 만든 글 5 · 올린 글 2
  const rows = Array.from({ length: 5 }, (_, i) => ({
    store_id: store!.id, channel: 'blog',
    title: `채널검증 ${i}`, body_html: `<p>${'가'.repeat(200)}</p>`, body_plain: '가'.repeat(200),
    status: i < 2 ? 'published' : 'draft',
    published_at: i < 2 ? new Date().toISOString() : null,
  }));
  await sb.from('posts').insert(rows);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await ctx.newPage();

  try {
    const { data: link } = await sb.auth.admin.generateLink({
      type: 'recovery', email: OWNER.email,
      options: { redirectTo: `${BASE}/auth/callback?next=/channels` },
    });
    await page.goto(link!.properties!.action_link, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/channels/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!page.url().includes('/channels')) await page.goto(`${BASE}/channels`, { waitUntil: 'domcontentloaded' });
    const screen = await text(page);
    if (/로그인하세요/.test(screen)) throw new Error('로그인 실패 — 이후 판정이 무의미');

    // ① 행동별로 묶였는가 — 우리 분류(유입/판매/재방문/광고)가 아니라
    check('행동별로 묶여 있다', /바로 씁니다/.test(screen) && /키를 넣으면 열립니다/.test(screen) && /아직 못 엽니다/.test(screen),
      /바로 씁니다/.test(screen) ? '세 그룹 모두 보임' : `그룹이 안 보인다: ${screen.slice(0, 100)}`);
    check('우리 분류로 묶여 있지 않다', !/유입 · 손님을 데려온다/.test(screen),
      /유입 · 손님을 데려온다/.test(screen) ? '옛 분류가 남아 있다' : '옛 분류 없음');

    // ② 실적이 DB와 같은가 — "연결됨"이라고 적고 0건이면 그게 보여야 한다
    check('블로그 실적이 DB와 같다', /만든 글 5 · 올림 2/.test(screen),
      /만든 글 5 · 올림 2/.test(screen) ? '만든 글 5 · 올림 2' : `화면: ${/만든 글[^·]*·[^ ]* \d+/.exec(screen)?.[0] ?? '표시 없음'}`);

    // ③ 못 여는 이유가 적혀 있는가 — "준비 중"으로 뭉뚱그리면 안 된다
    check('못 여는 채널에 진짜 이유가 있다', /Meta 심사/.test(screen),
      /Meta 심사/.test(screen) ? '인스타에 심사 대기 이유 표시' : '이유 없이 준비중만 적혀 있다');

    // ④ 키 입력이 실제로 열리고 발급처로 보내는가
    const keyBtn = page.getByRole('button', { name: /키 넣기/ }).first();
    const hasKeyBtn = (await keyBtn.count()) > 0;
    check('키를 넣을 곳이 있다', hasKeyBtn, hasKeyBtn ? '[키 넣기] 버튼 있음' : '키를 넣을 화면이 없다');
    if (hasKeyBtn) {
      await keyBtn.click();
      await page.waitForTimeout(1200);
      const sheet = await text(page);
      check('발급처로 바로 갈 수 있다', /발급받기/.test(sheet),
        /발급받기/.test(sheet) ? '발급 링크 있음' : '어디서 받는지 안 알려준다');
      check('비밀번호가 아니라고 못 박는다', /비밀번호가 아니라/.test(sheet),
        /비밀번호가 아니라/.test(sheet) ? '안심 문구 있음' : '무엇을 넣는 건지 불안하다');
    }

    // ⑤ 확장 안내 — 6곳을 한 번에 여는 유일한 동작이라 가장 앞이어야 한다
    check('확장 안내가 채널 목록보다 앞에 있다',
      screen.indexOf('크롬 확장을 깔면') !== -1 && screen.indexOf('크롬 확장을 깔면') < screen.indexOf('바로 씁니다'),
      screen.includes('크롬 확장을 깔면') ? '목록보다 앞' : '확장 안내가 없다');

  } finally {
    await browser.close();
    if (!process.argv.includes('--keep')) await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'━'.repeat(56)}\n검증 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('검증 실패:', e instanceof Error ? e.message : e); process.exit(1); });
