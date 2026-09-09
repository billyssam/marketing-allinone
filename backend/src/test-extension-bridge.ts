/**
 * 확장 다리 실검증 — **확장을 실제로 로드한 브라우저로.**
 *
 * 왜 필요한가: 확장은 "깔았다고 되는 것"이 아니다. content script 가 우리 도메인에 실제로
 * 꽂히는지, 웹앱이 보낸 창 메시지에 답이 오는지, **안 깔았을 때 화면이 그대로 동작하는지**
 * 셋 다 확인해야 한다. 코드를 옮겨 놓고 "됐다"고 하면 그게 지난 몇 주와 같은 실수다.
 *
 * 검증:
 *   A. 확장 없이 → 원클릭 버튼이 안 뜨고 붙여넣기 3단계가 그대로 (설치 강요 금지)
 *   B. 확장 있으면 → PING 에 답이 온다(감지됨)
 *   C. 확장 있으면 → 원클릭 버튼이 뜬다
 *   D. 버튼을 누르면 → 초안이 확장 저장소에 실제로 들어간다
 *
 * ⚠️ 네이버 에디터에 실제로 채워지는 것까지는 여기서 못 본다(네이버 로그인 필요).
 *    그 구간은 사장님이 직접 확인해야 한다 — 정직하게 남긴다.
 *
 * 사용법: npx tsx src/test-extension-bridge.ts --url=https://marketing-allinone.vercel.app
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type BrowserContext } from 'playwright';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3500';
const EXT_PATH = resolve(process.cwd(), '../extension');

const OWNER = { email: 'ext-test@example.com', store: '확장검증 매장' };
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '🔴'} ${name} — ${detail}`);
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

/** 붙여넣기 화면을 열고 원클릭 버튼 유무를 본다 */
async function openPrepare(ctx: BrowserContext, postId: string) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/prepare?post=${postId}`, { waitUntil: 'domcontentloaded' });
  // 초안 fetch + 확장 감지(1.2초)가 끝날 시간을 준다
  await page.waitForTimeout(4000);
  const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const hasOneClick = body.includes('네이버 블로그에 바로 채우기');
  return { page, body, hasOneClick };
}

async function main() {
  if (process.argv.includes('--cleanup-only')) { await cleanup(); console.log('정리 완료'); return; }
  await cleanup();

  // 검증용 매장 + 블로그 초안 하나
  const { data: created, error } = await sb.auth.admin.createUser({
    email: OWNER.email, password: 'ExtTest!2026', email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`계정 생성 실패: ${error?.message}`);
  const { data: store } = await sb.from('stores').insert({
    owner_id: created.user.id, name: OWNER.store, industry_id: 'cafe',
    onboarded_at: new Date().toISOString(),
  }).select('id').single();
  const { data: post } = await sb.from('posts').insert({
    store_id: store!.id, channel: 'blog',
    title: '확장 검증용 제목',
    body_html: `<p>${'가'.repeat(300)}</p>`,
    body_plain: '가'.repeat(300),
    tags: ['검증', '확장'],
    status: 'draft',
  }).select('id').single();
  const postId = post!.id as string;

  // ── A. 확장 **없이** ────────────────────────────────────────────────
  const plain = await chromium.launchPersistentContext('', { viewport: { width: 390, height: 844 } });
  try {
    const { body, hasOneClick } = await openPrepare(plain, postId);
    check('확장 없으면 원클릭 버튼이 안 뜬다', !hasOneClick,
      hasOneClick ? '설치 안 했는데 버튼이 보인다' : '안 보임(맞다)');
    check('확장 없어도 붙여넣기 흐름이 그대로다', /제목|복사/.test(body),
      /제목|복사/.test(body) ? '붙여넣기 화면 정상' : '화면이 비었다');
  } finally {
    await plain.close();
  }

  // ── B~D. 확장 **로드** ──────────────────────────────────────────────
  // MV3 확장은 헤드리스에서 서비스워커가 안 뜨는 경우가 있어 headless=false 로 띄운다
  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    viewport: { width: 390, height: 844 },
  });
  try {
    const { page, hasOneClick } = await openPrepare(ctx, postId);

    // B. content script 가 실제로 꽂혔는가 — 웹앱과 같은 규약으로 직접 물어본다
    const ping = await page.evaluate(async () => {
      return await new Promise<{ ok: boolean; version?: string }>((res) => {
        const reqId = 'probe-1';
        const t = setTimeout(() => res({ ok: false }), 2500);
        window.addEventListener('message', function h(ev) {
          const d = ev.data as { source?: string; reqId?: string; ok?: boolean; version?: string };
          if (d?.source !== 'maio-ext' || d.reqId !== reqId) return;
          clearTimeout(t);
          window.removeEventListener('message', h);
          res({ ok: Boolean(d.ok), version: d.version });
        });
        window.postMessage({ source: 'maio-web', reqId, type: 'PING' }, window.location.origin);
      });
    });
    check('확장 content script 가 우리 도메인에 꽂힌다', ping.ok, ping.ok ? `PING 응답 v${ping.version}` : '응답 없음');

    // C. 화면에 버튼이 뜨는가
    check('확장이 있으면 원클릭 버튼이 뜬다', hasOneClick, hasOneClick ? '버튼 보임' : '감지는 됐는데 버튼이 없다');

    // D. 눌렀을 때 초안이 확장 저장소에 실제로 들어가는가
    if (hasOneClick) {
      const btn = page.getByRole('button', { name: /바로 채우기/ }).first();
      await btn.click();
      await page.waitForTimeout(3000);
      const after = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const failed = /응답하지 않습니다|전달 실패|거절/.test(after);
      check('버튼을 누르면 확장이 초안을 받는다', !failed,
        failed ? `화면에 실패 문구: ${/[^.]*(응답하지|전달 실패|거절)[^.]*/.exec(after)?.[0] ?? ''}` : '오류 문구 없음');
    }
  } finally {
    await ctx.close();
    if (!process.argv.includes('--keep')) await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'━'.repeat(56)}\n검증 ${results.length}건 · 통과 ${results.length - failed.length} · 실패 ${failed.length}`);
  console.log('⚠️ 네이버 에디터에 실제로 채워지는 구간은 로그인이 필요해 여기서 확인 못 함 — 사장님 확인 필요');
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('검증 실패:', e instanceof Error ? e.message : e); process.exit(1); });
