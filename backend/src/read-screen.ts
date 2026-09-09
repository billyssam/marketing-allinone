/**
 * 화면을 **사람처럼 읽는다** — 판정어 통과가 아니라 문장 자체를 본다.
 *
 * 자동 검증은 내가 미리 생각한 실패만 잡는다. 화면에 실제로 뭐라고 쓰여 있는지는
 * 눈으로 읽어야 안다(2026-09-08에 흰 종이에 흰 글자를 그렇게 발견했다).
 *
 * 사용법: npx tsx src/read-screen.ts /channels --email=channels-test@example.com
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'https://marketing-allinone.vercel.app';
/**
 * ⚠️ Git Bash 는 **슬래시로 시작하는 인자를 윈도우 경로로 바꿔버린다**
 *    (실측: `/channels` → `C:/Program Files/Git/channels`, `--path=/channels` 도 마찬가지).
 *    그래서 슬래시 없이 `--path=channels` 로 받고 여기서 붙인다.
 */
const rawPath = process.argv.find((a) => a.startsWith('--path='))?.split('=')[1] ?? 'dashboard';
const path = `/${rawPath.replace(/^[/\\]+/, '').replace(/^.*Git[/\\]/, '')}`;
const email = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  if (!email) { console.error('--email= 로 로그인할 계정을 주세요'); process.exit(1); }
  const { data: link } = await sb.auth.admin.generateLink({
    type: 'recovery', email,
    options: { redirectTo: `${BASE}/auth/callback?next=${path}` },
  });
  if (!link?.properties?.action_link) { console.error('로그인 링크 발급 실패'); process.exit(1); }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });

  await page.goto(link.properties.action_link, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(new RegExp(path.replace('/', '\\/')), { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3500);
  // 콜백이 항상 next 로 가지는 않는다 — 도착지를 되읽어 확인하고, 아니면 직접 간다
  if (!page.url().includes(path)) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(2500);

  // 줄바꿈을 살려서 읽는다 — 한 줄로 뭉치면 위계가 안 보인다
  const lines = await page.locator('body').innerText();
  console.log(`── ${BASE}${path} ──\n`);
  console.log(lines.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'));
  if (errs.length) console.log(`\n🔴 콘솔 에러 ${errs.length}건:\n  ${errs.slice(0, 5).join('\n  ')}`);
  else console.log('\n콘솔 에러 0건');

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
