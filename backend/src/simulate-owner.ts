/**
 * 사장님 시뮬레이션 — 테스터를 투입할 수 없으니 **내가 사장님이 되어** 전 경로를 돈다.
 *
 * 왜 필요한가: 지금까지 검증은 전부 조각이었다(API 호출, DB 조회, 화면 한 장).
 * 실제 사장님은 초대 링크를 누르고, 비밀번호를 정하고, 온보딩을 하고, 첫 글을 받고,
 * 붙여넣기를 하고, 다음 날 또 온다. **그 이음매에서 막히는 걸 아무도 본 적이 없다.**
 *
 * 이 스크립트는 그 여정을 실제 브라우저로 끝까지 걸어가면서
 * 각 단계에서 **사장님 눈에 보이는 것**을 그대로 받아 적는다.
 * 판단(좋다/나쁘다)은 사람이 한다 — 여기서는 "무엇이 보였는가"만 정직하게 남긴다.
 *
 * 사용법:
 *   npx tsx src/simulate-owner.ts                 # 로컬(localhost:3500)
 *   npx tsx src/simulate-owner.ts --url=https://… # 다른 환경
 *   npx tsx src/simulate-owner.ts --keep          # 끝나고 계정을 지우지 않음(수동 확인용)
 *
 * ⚠️ 검증 계정·매장은 기본적으로 **끝나면 지운다.** 안 지우면 다음 아침 크론이 물고 쿼터를 쓴다.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const BASE = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3500';
const KEEP = process.argv.includes('--keep');
/**
 * 정리만 하고 끝낸다.
 * 크론이 취소·타임아웃되면 `finally`가 안 돌아 검증 매장이 남고,
 * 그러면 **다음 아침 크론이 그 매장 글을 만들며 Gemini 쿼터를 쓴다.**
 * 워크플로에서 `if: always()`로 이걸 한 번 더 불러 확실히 지운다.
 */
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const EMAIL = 'sim-owner@example.com';
const PASSWORD = 'SimOwner!2026';
const STORE = '동네빵집 시뮬';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** 사장님이 실제로 본 화면을 그대로 받아 적는다 */
const log: string[] = [];
function step(title: string) {
  log.push(`\n${'━'.repeat(64)}\n▶ ${title}\n${'━'.repeat(64)}`);
  console.log(`\n▶ ${title}`);
}
function saw(what: string, detail: string) {
  log.push(`  ${what}: ${detail}`);
  console.log(`  ${what}: ${detail.slice(0, 120)}`);
}
/** 사장님이 막히는 지점 — 판단은 사람이 하되, 눈에 띄는 건 표시해 둔다 */
const friction: string[] = [];
function stuck(why: string) {
  friction.push(why);
  log.push(`  🔴 막힘: ${why}`);
  console.log(`  🔴 막힘: ${why}`);
}

/**
 * 화면 글자를 읽는다 — **내용이 그려질 때까지 기다렸다가.**
 *
 * 고정 대기 뒤에 바로 읽으면, 서버 컴포넌트 렌더가 늦게 오는 순간에 **빈 문자열**을 받는다.
 * 그 상태로 판정하면 "안내가 없다"는 가짜 막힘이 난다(2026-08-22 무인 실행에서 실제로 터졌다).
 * 대시보드 한 곳만 고쳤더니 나머지 6곳이 그대로였다 —
 * 같은 유형은 **읽는 함수 하나**에서 막는다.
 */
async function text(page: Page, waitMs = 8000): Promise<string> {
  const deadline = Date.now() + waitMs;
  let out = '';
  do {
    out = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (out.length > 50) return out;
    await page.waitForTimeout(500);
  } while (Date.now() < deadline);
  return out; // 끝내 비면 그대로 돌려준다 — 호출부가 "안 그려졌다"로 판정한다
}

/**
 * 입력하고 **실제로 들어갔는지 확인**한다.
 *
 * 처음엔 `input[type="text"]`로 잡았는데 온보딩 입력칸엔 type 속성이 아예 없어서
 * 아무것도 못 찾았다. 그런데 코드가 조용히 넘어가며 "입력함"이라고 로그를 남겼다 —
 * **검증 도구가 거짓말을 하는 게 결함을 놓치는 것보다 나쁘다.** 값을 되읽어 확인한다.
 */
async function fillOrStuck(page: Page, placeholder: RegExp, value: string, label: string): Promise<boolean> {
  const el = page.getByPlaceholder(placeholder).first();
  if (!(await el.count())) {
    stuck(`${label}: 입력칸을 못 찾았다(placeholder=${placeholder})`);
    return false;
  }
  await el.fill(value);
  const got = await el.inputValue();
  if (got !== value) {
    stuck(`${label}: 입력이 안 먹었다(넣은 값 "${value}" / 실제 "${got}")`);
    return false;
  }
  saw(label, `"${value}"`);
  return true;
}

/** 버튼이 눌리는 상태가 될 때까지 기다렸다가 누른다. 안 눌리면 그게 사장님이 막히는 지점이다. */
async function clickOrStuck(page: Page, name: RegExp, label: string, ms = 8000): Promise<boolean> {
  const btn = page.getByRole('button', { name }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: ms });
    if (await btn.isDisabled()) {
      stuck(`${label}: [${(await btn.innerText()).trim()}] 버튼이 눌리지 않는다(비활성)`);
      return false;
    }
    await btn.click();
    return true;
  } catch {
    stuck(`${label}: 버튼을 못 찾았다(${name})`);
    return false;
  }
}

async function cleanup() {
  const { data: stores } = await supabase.from('stores').select('id').eq('name', STORE);
  for (const s of stores ?? []) {
    await supabase.from('posts').delete().eq('store_id', s.id);
    await supabase.from('channel_connections').delete().eq('store_id', s.id);
    await supabase.from('reviews').delete().eq('store_id', s.id);
    await supabase.from('regulars').delete().eq('store_id', s.id);
    await supabase.from('stores').delete().eq('id', s.id);
  }
  const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) if (u.email === EMAIL) await supabase.auth.admin.deleteUser(u.id);
}

async function main() {
  if (CLEANUP_ONLY) {
    await cleanup();
    console.log('검증 계정·매장 정리 완료');
    return;
  }
  await cleanup(); // 이전 실행 잔재부터

  const browser = await chromium.launch();
  // 사장님은 폰으로 쓴다 — 데스크톱 폭으로 검증하면 실제와 다른 화면을 보게 된다
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));

  try {
    // ── 1. 운영자가 초대한다 ───────────────────────────────────────────
    step('1. 초대 — 운영자가 계정을 열고 사장님에게 링크를 보낸다');
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (cErr || !created?.user) {
      stuck(`계정 생성 실패: ${cErr?.message}`);
      return;
    }
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: EMAIL,
      options: { redirectTo: `${BASE}/auth/callback?next=/onboarding` },
    });
    const inviteLink = linkData?.properties?.action_link ?? '';
    saw('초대 링크 발급', inviteLink ? '성공(토큰은 기록하지 않음)' : '실패');
    if (!inviteLink) {
      stuck('초대 링크를 못 만들었다');
      return;
    }

    // ── 2. 사장님이 카톡에서 링크를 누른다 ────────────────────────────
    step('2. 사장님이 링크를 누른다 → 어디에 도착하는가');
    await page.goto(inviteLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    saw('도착 주소', page.url().replace(BASE, ''));
    const t2 = await text(page);
    saw('화면', t2.slice(0, 200));
    if (page.url().includes('/login') && /error|오류|다시/.test(t2)) {
      stuck('초대 링크가 로그인 화면으로 튕겼다 — 사장님은 여기서 포기한다');
    }

    // ── 3. 온보딩 ──────────────────────────────────────────────────────
    step('3. 온보딩 — 몇 번 눌러야 끝나는가');
    if (!page.url().includes('/onboarding')) {
      await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    }
    let taps = 0;
    const NEXT = /다음|시작|완료/;

    // 스텝1 — 매장 이름
    if (await fillOrStuck(page, /쿵더쿵|상호|매장/, STORE, '스텝1 매장명')) taps++;
    if (await clickOrStuck(page, NEXT, '스텝1')) taps++;
    await page.waitForTimeout(900);

    // 스텝2 — 업종. 사장님은 43개 목록에서 자기 업종을 찾아야 한다
    saw('스텝2 업종 화면', (await text(page)).slice(0, 200));
    const bakery = page.getByText('베이커리·제과', { exact: false }).first();
    if (await bakery.count()) {
      await bakery.click();
      taps++;
      saw('업종 선택', '베이커리·제과');
    } else {
      stuck('업종 목록에서 "베이커리·제과"를 못 찾았다');
    }
    await page.waitForTimeout(500);
    if (await clickOrStuck(page, NEXT, '스텝2')) taps++;
    await page.waitForTimeout(900);

    // 스텝3 — 판매 항목
    saw('스텝3 판매항목 화면', (await text(page)).slice(0, 220));
    if (await fillOrStuck(page, /이름/, '소금빵', '항목명')) taps++;
    const price = page.locator('input[inputmode="numeric"]').first();
    if (await price.count()) {
      await price.fill('3800');
      taps++;
      saw('가격', '3,800원');
    } else {
      stuck('가격 입력칸을 못 찾았다');
    }
    if (await clickOrStuck(page, NEXT, '스텝3')) taps++;
    await page.waitForTimeout(900);

    // 스텝4 — 플레이스. 다수가 여기서 건너뛴다
    saw('스텝4 플레이스 화면', (await text(page)).slice(0, 200));
    if (await clickOrStuck(page, NEXT, '스텝4')) taps++;
    saw('플레이스', '건너뜀(실제로 가장 흔한 선택)');
    await page.waitForTimeout(900);

    // 스텝5 — 채널
    saw('스텝5 채널 화면', (await text(page)).slice(0, 250));
    const submitAt = Date.now();
    if (await clickOrStuck(page, NEXT, '스텝5')) taps++;

    // **전환이 몇 초 걸리는가.** 화면이 그대로면 사장님은 안 된 줄 알고 다시 누른다 →
    // 매장이 두 개 생길 수 있다. 그래서 시간을 재고, 중복 생성 여부까지 확인한다.
    let landedMs = 0;
    for (let i = 0; i < 60; i++) {
      if (page.url().includes('/dashboard')) {
        landedMs = Date.now() - submitAt;
        break;
      }
      await page.waitForTimeout(500);
    }
    // 서버리스 콜드스타트 때문에 실측이 3.1~7.2초로 흔들린다. 매번 다른 판정이 나오면
    // 시뮬레이션을 못 믿게 되므로, **되돌릴 수 없는 선(10초)**만 막힘으로 본다.
    // 대신 걸린 시간은 항상 적어 둔다 — 사장님이 실제로 기다리는 시간이 그 숫자다.
    saw('완료 → 대시보드 전환', landedMs ? `${(landedMs / 1000).toFixed(1)}초` : '30초 안에 안 넘어감');
    if (!landedMs) stuck('완료를 눌러도 화면이 안 넘어간다 — 사장님은 다시 누른다');
    else if (landedMs > 10_000) stuck(`전환이 ${(landedMs / 1000).toFixed(1)}초 — 이쯤이면 고장난 줄 안다`);
    else if (landedMs > 5000) saw('⚠️ 참고', '5초를 넘었다. 반복되면 버튼에 진행 표시가 필요하다');

    const { count: storeCount } = await supabase
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .eq('name', STORE);
    saw('생성된 매장 수', `${storeCount}곳`);
    if ((storeCount ?? 0) > 1) stuck(`같은 매장이 ${storeCount}곳 만들어졌다 — 중복 제출 방어가 없다`);
    saw('온보딩 완료까지 탭 수', `${taps}회`);
    saw('도착', page.url().replace(BASE, ''));
    if (!page.url().includes('/dashboard')) {
      stuck(`온보딩 후 대시보드로 안 갔다 (현재: ${page.url().replace(BASE, '')})`);
    }

    // ── 4. 첫 화면 ─────────────────────────────────────────────────────
    step('4. 대시보드 첫 인상 — 뭘 하라고 하는가');
    /**
     * **URL이 아니라 화면이 그려질 때까지** 기다린다.
     *
     * 8/18에 "대시보드 URL에 닿을 때까지 기다리기"로 고쳤는데 8/22 무인 실행에서 또 터졌다.
     * 로그를 보니 전환은 4.0초로 성공했는데 **첫 화면 전문이 빈 문자열**이었다 —
     * URL이 먼저 바뀌고 서버 컴포넌트 렌더가 아직 도착 전인 순간을 읽은 것이다.
     *
     * 그리고 그때 "다음 행동이 안 보인다"고 보고했다. 그건 **다른 결함**이다:
     *   · 화면이 아예 안 그려짐  → 사장님은 빈 화면을 본다
     *   · 그려졌는데 안내가 없음 → 사장님은 뭘 할지 모른다
     * 둘을 같은 문장으로 보고하면 원인을 못 찾는다. 나눠서 판정한다.
     */
    for (let i = 0; i < 12 && !page.url().includes('/dashboard'); i++) await page.waitForTimeout(1000);
    const dash = await text(page, 20_000); // 첫 진입은 콜드스타트가 겹쳐 더 기다린다
    saw('첫 화면 전문', dash ? dash.slice(0, 900) : '(비어 있음)');
    if (!dash) {
      stuck('대시보드가 20초 안에 안 그려졌다 — 사장님은 빈 화면을 본다');
    } else if (!/붙여넣기|오늘 하나만|첫 글|초안을 만들고/.test(dash)) {
      // '첫 블로그 초안을 만들고 있어요'도 명백한 다음 안내인데 판정어에 없어서 오탐이 난 적 있다
      stuck('첫 화면은 떴는데 다음에 뭘 할지가 안 보인다');
    }

    // ── 5. 웰컴 초안이 오는가 ──────────────────────────────────────────
    step('5. 첫 글 — 얼마나 기다려야 하는가');
    const t0 = Date.now();
    let drafts = 0;
    for (let i = 0; i < 24; i++) {
      const { data: s } = await supabase.from('stores').select('id').eq('name', STORE).maybeSingle();
      if (s) {
        const { count } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', s.id);
        drafts = count ?? 0;
        if (drafts > 0) break;
      }
      await page.waitForTimeout(5000);
    }
    const waited = Math.round((Date.now() - t0) / 1000);
    saw('첫 글까지', drafts > 0 ? `${waited}초 · ${drafts}건` : `${waited}초 기다렸는데 0건`);

    // 안 왔을 때 **사장님이 스스로 빠져나올 수 있는가**가 진짜 질문이다.
    // 웰컴 초안은 응답 뒤 백그라운드(after)로 도는데, 배포 직후처럼 인스턴스가 바뀌면 날아간다 —
    // 파일럿 첫날에도 일어날 수 있다. 그때 화면에 자가복구 버튼이 실제로 뜨는지, 눌러서 되는지 본다.
    if (drafts === 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const recover = page.getByRole('button', { name: /첫 글 만들기|지금 만들기/ }).first();
      if (!(await recover.count())) {
        stuck('첫 글이 안 왔는데 되살릴 버튼도 없다 — 사장님은 빈 화면에 갇힌다');
      } else {
        saw('자가복구 버튼', '있음 → 눌러본다');
        await recover.click();
        let recovered = 0;
        for (let i = 0; i < 18; i++) {
          const { data: s } = await supabase.from('stores').select('id').eq('name', STORE).maybeSingle();
          if (s) {
            const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('store_id', s.id);
            recovered = count ?? 0;
            if (recovered > 0) break;
          }
          await page.waitForTimeout(5000);
        }
        drafts = recovered;
        if (recovered > 0) saw('자가복구 결과', `${recovered}건 생성됨 — 사장님이 스스로 빠져나올 수 있다`);
        else stuck('자가복구 버튼을 눌러도 글이 안 만들어진다');
      }
    }
    if (drafts === 0) stuck('첫 글이 끝내 안 왔다 — 가입 첫날 빈 화면을 본다');

    // ── 6. 붙여넣기 ────────────────────────────────────────────────────
    step('6. 붙여넣기 — 실제로 올릴 수 있는가');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const paste = page.getByRole('link', { name: /붙여넣기/ }).first();
    if (await paste.count()) {
      await paste.click();
      await page.waitForTimeout(3000);
      saw('이동', page.url().replace(BASE, '').slice(0, 60));
      const prep = await text(page);
      saw('붙여넣기 화면', prep.slice(0, 600));
      if (!/STEP|복사/.test(prep)) stuck('붙여넣기 화면이 안 떴다');
    } else {
      stuck('대시보드에 [붙여넣기] 버튼이 없다');
    }

    // ── 7. 붙여넣기 완주 ───────────────────────────────────────────────
    // 여기까지 와서 [완료]를 눌러야 비로소 "올렸다"가 기록된다.
    // 중간에 막히면 사장님은 매일 이 자리에서 포기한다.
    step('7. 붙여넣기 끝까지 — 완료를 누를 수 있는가');
    if (page.url().includes('/prepare')) {
      let hops = 0;
      for (let i = 0; i < 5; i++) {
        const t = await text(page);
        if (/다 붙여넣었어요/.test(t)) break;
        const cta = page.getByRole('button', { name: /붙여넣었어요|완료|다음/ }).first();
        if (!(await cta.count())) {
          stuck(`붙여넣기 ${i + 1}단계에서 다음 버튼이 없다`);
          break;
        }
        await cta.click();
        hops++;
        await page.waitForTimeout(1500);
      }
      const done = await text(page);
      saw('완료 화면', done.slice(0, 200));
      saw('단계 수', `${hops}번 눌러 완주`);
      if (!/다 붙여넣었어요/.test(done)) stuck('붙여넣기를 끝까지 못 갔다');
    }

    // ── 8. 올린 뒤 대시보드가 달라지는가 ──────────────────────────────
    step('8. 올린 뒤 — 화면이 반응하는가');
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const afterPub = await text(page);
    saw('오늘 할 일', (afterPub.match(/오늘 할 일 \d+ 건 [가-힣 +·]{2,20}/) ?? ['(못 찾음)'])[0]);
    if (!/몫은 끝났어요|하나 \+ 답글/.test(afterPub)) {
      stuck('올렸는데 "오늘 할 일"이 그대로다 — 한 게 반영 안 된다');
    }

    // ── 9. 리뷰가 들어왔을 때 ─────────────────────────────────────────
    // 이 매장은 플레이스를 안 붙였으니 크롤이 안 돈다 → 크롤러와 **같은 형태로** 주입해서
    // 답글 화면이 실제로 어떻게 보이는지 확인한다(주입이라는 사실은 그대로 밝힌다).
    step('9. 리뷰 답글 — 손님 글에 답할 수 있는가 (리뷰는 크롤 대신 주입)');
    const { data: simStore } = await supabase.from('stores').select('id').eq('name', STORE).maybeSingle();
    if (simStore) {
      const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
      await supabase.from('reviews').insert([
        {
          store_id: simStore.id, source: 'naver_place', external_id: 'sim-neg',
          author_display: '손님A', content: '빵은 맛있는데 기다리는 시간이 너무 길었어요',
          rating: 2, sentiment: 'negative', posted_at: ago(1),
          reply_draft: '손님A님, 기다리게 해드려 죄송합니다. 굽는 시간을 다시 조정하겠습니다. — 동네빵집 시뮬',
        },
        {
          store_id: simStore.id, source: 'naver_place', external_id: 'sim-pos',
          author_display: '손님B', content: '소금빵이 갓 구워져 나와서 정말 맛있었어요',
          rating: 5, sentiment: 'positive', posted_at: ago(0),
          reply_draft: '손님B님, "소금빵이 갓 구워져 나와서 정말 맛있었어요"라고 해주신 말씀 정말 감사합니다. — 동네빵집 시뮬',
        },
      ]);
      await page.goto(`${BASE}/reviews`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const rev = await text(page);
      saw('리뷰 화면', rev.slice(0, 420));
      if (!/부정|답글/.test(rev)) stuck('리뷰 화면에 답글 흐름이 안 보인다');
      const sent = page.getByRole('button', { name: /답글 달았|발송|완료/ }).first();
      saw('답글 완료 버튼', (await sent.count()) ? '있음' : '없음');
      if (!(await sent.count())) stuck('답글을 달았다고 표시할 방법이 없다');
    }

    // ── 10. 단골 재방문 문자 ──────────────────────────────────────────
    step('10. 단골 문자 — 끊긴 손님에게 보낼 수 있는가');
    await page.goto(`${BASE}/regulars`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const reg = await text(page);
    saw('단골 화면', reg.slice(0, 300));
    if (!/단골|고객|추가/.test(reg)) stuck('단골 화면이 안 뜬다');

    // ── 11. 주간 리포트 ───────────────────────────────────────────────
    step('11. 주간 리포트 — 한 주를 어떻게 요약해 주는가');
    await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const rep = await text(page);
    saw('리포트 전문', rep.slice(0, 500));
    if (/지나간 글|안 올린 글 \d+개/.test(rep)) {
      stuck('리포트가 아직 "지나간 글/안 올린 글"로 사장님을 몰아세운다');
    }

    // ── 12. 콘솔 에러 ─────────────────────────────────────────────────
    step('12. 여정 중 콘솔 에러');
    saw('에러 수', String(consoleErrors.length));
    for (const e of consoleErrors.slice(0, 6)) saw('  ·', e);
  } finally {
    await browser.close();
    if (!KEEP) await cleanup();
    const out = [
      `사장님 시뮬레이션 — ${BASE}`,
      `막힌 지점 ${friction.length}건`,
      ...friction.map((f) => `  🔴 ${f}`),
      ...log,
    ].join('\n');
    console.log(`\n\n${'═'.repeat(64)}\n${out}\n`);

    // 크론이 알림 본문에 넣을 요약 — 로그 전문을 이슈에 붙이면 아무도 안 읽는다.
    // 막힌 지점만 뽑아 두고, 자세한 건 런 로그 링크로 보낸다.
    if (process.env.SIM_SUMMARY_FILE) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        process.env.SIM_SUMMARY_FILE,
        friction.length ? friction.map((f) => `- ${f}`).join('\n') : '막힌 지점 없음',
        'utf8',
      );
    }
    if (friction.length) process.exit(1);
  }
}

main().catch((e) => {
  console.error('시뮬레이션 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
