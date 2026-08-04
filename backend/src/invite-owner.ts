/**
 * 파일럿 사장님 초대 — **이메일 없이** 계정을 열어준다.
 *
 * 왜 필요한가(실측):
 *   Supabase 내장 메일 서비스는 프로젝트 전체 **시간당 2통**이고, 팀 멤버가 아닌
 *   주소로는 발송을 거부한다. 확인메일도 ON(mailer_autoconfirm=false)이라
 *   사장님이 직접 가입하면 → `429 over_email_send_rate_limit` → **계정 자체가 생성되지 않는다.**
 *   8/20 파일럿에서 3번째 사장님부터 100% 막히는 구간.
 *
 *   커스텀 SMTP(Resend 등)를 붙이면 근본 해결되지만 그건 외부 계정 작업이다.
 *   이 스크립트는 그것 없이도 **오늘 당장** 파일럿을 열 수 있게 한다.
 *   운영자가 링크를 뽑아 카톡으로 보내면 끝 — 어차피 파일럿 소통은 카톡으로 한다.
 *
 * 사용법:
 *   cd backend && npx tsx src/invite-owner.ts <이메일> [사장님이름]
 *
 * 동작:
 *   1) 계정 생성 + email_confirm=true (확인메일 불필요)
 *   2) 비밀번호 설정 링크 생성(generateLink=recovery) — 메일 발송 없이 링크만 반환
 *   3) 링크가 막히면 임시 비밀번호로 자동 폴백 — 어떤 경우에도 사장님은 들어올 수 있다
 *   4) 카톡에 그대로 붙여넣을 안내문 출력
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 이 스크립트가 뱉는 링크는 **사장님 휴대폰으로 카톡 전송된다**.
// 로컬 개발 env(NEXT_PUBLIC_APP_URL=http://localhost:3500)를 그대로 쓰면
// 사장님에게 죽은 링크를 보내게 된다 — 실제로 첫 실행에서 그렇게 나왔다.
// 따라서 기본은 언제나 운영 주소, 로컬 주소는 PILOT_APP_URL로만 명시 허용.
const PROD_URL = 'https://marketing-allinone.vercel.app';
const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const isLocal = !!envAppUrl && /localhost|127\.0\.0\.1/.test(envAppUrl);
const appUrl = process.env.PILOT_APP_URL ?? (isLocal || !envAppUrl ? PROD_URL : envAppUrl);
if (isLocal && !process.env.PILOT_APP_URL) {
  console.log(`ℹ️  NEXT_PUBLIC_APP_URL이 로컬(${envAppUrl}) → 초대 링크는 운영 주소(${PROD_URL})로 생성합니다.`);
}

if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const email = (process.argv[2] ?? '').trim().toLowerCase();
const ownerName = (process.argv[3] ?? '사장님').trim();
if (!email.includes('@')) {
  console.error('사용법: npx tsx src/invite-owner.ts <이메일> [사장님이름]');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** 사람이 카톡으로 받아 치기 쉬운 임시 비밀번호(혼동 문자 제외) */
function tempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const raw = randomBytes(10);
  return Array.from(raw, (b) => alphabet[b % alphabet.length]).join('');
}

/** 생성된 액션 링크가 실제로 우리 운영 주소로 되돌아오는가 */
function linkRedirectsTo(actionLink: string, expectedBase: string): boolean {
  try {
    const target = new URL(actionLink).searchParams.get('redirect_to');
    return !!target && new URL(target).origin === new URL(expectedBase).origin;
  } catch {
    return false;
  }
}

async function findUserByEmail(target: string) {
  // admin.listUsers는 필터가 없어 페이지를 훑는다(파일럿 규모라 1~2페이지면 충분)
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(email);
  const password = tempPassword();

  let userId: string;
  if (existing) {
    // 이미 있는 계정 — 재초대(비밀번호 분실/미확인 상태 복구)로 취급
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`기존 계정 갱신 실패: ${error.message}`);
    userId = data.user.id;
    console.log(`ℹ️  이미 있는 계정 → 임시 비밀번호 재발급 + 이메일 확인 처리 (${email})`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ★ 확인메일 없이 즉시 사용 가능 상태로 생성
    });
    if (error) throw new Error(`계정 생성 실패: ${error.message}`);
    userId = data.user.id;
    console.log(`✅ 계정 생성 (${email})`);
  }

  // 비밀번호를 사장님이 직접 정하게 하는 링크(메일 발송 없음).
  // 실패해도 임시 비밀번호 경로가 살아 있으므로 치명적이지 않다.
  let setupLink: string | null = null;
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/reset-password` },
  });
  if (linkErr) {
    console.log(`⚠️  설정 링크 생성 실패(${linkErr.message}) → 임시 비밀번호로 안내`);
  } else {
    const candidate = linkData.properties?.action_link ?? null;
    // ★ Supabase는 리다이렉트 허용목록에 없는 주소를 **조용히 Site URL로 바꿔치기**한다.
    //   (실측: 운영 주소를 넘겼는데 redirect_to=http://localhost:3000으로 반환)
    //   그대로 카톡에 보내면 사장님은 열리지도 않는 링크를 받는다 → 반드시 검증한다.
    setupLink = candidate && linkRedirectsTo(candidate, appUrl) ? candidate : null;
    if (candidate && !setupLink) {
      const actual = new URL(candidate).searchParams.get('redirect_to') ?? '(없음)';
      console.log(
        [
          `⚠️  설정 링크가 운영 주소로 안 나갑니다 (실제 redirect_to=${decodeURIComponent(actual)})`,
          `   원인: Supabase 리다이렉트 허용목록에 ${appUrl} 가 없음`,
          `   조치: Supabase → Authentication → URL Configuration에서`,
          `         Site URL = ${appUrl} / Redirect URLs에 ${appUrl}/** 추가`,
          `   → 지금은 임시 비밀번호 방식으로 안내합니다(이 경로는 정상 동작).`,
        ].join('\n')
      );
    }
  }

  console.log(`\nuser_id: ${userId}`);
  console.log('\n' + '─'.repeat(58));
  console.log('📋 카톡에 그대로 붙여넣기');
  console.log('─'.repeat(58));

  if (setupLink) {
    console.log(
      [
        `${ownerName}, 마케팅올인원 계정 열어드렸습니다 🙌`,
        ``,
        `아래 링크를 누르시면 비밀번호만 정하고 바로 시작하실 수 있어요.`,
        setupLink,
        ``,
        `(링크가 안 열리면 ${appUrl}/login 에서`,
        ` 아이디 ${email} / 임시 비밀번호 ${password} 로 로그인하셔도 됩니다)`,
      ].join('\n')
    );
  } else {
    console.log(
      [
        `${ownerName}, 마케팅올인원 계정 열어드렸습니다 🙌`,
        ``,
        `주소: ${appUrl}/login`,
        `아이디: ${email}`,
        `임시 비밀번호: ${password}`,
        ``,
        `로그인하신 뒤 ${appUrl}/reset-password 에서 비밀번호를 바꾸시면 됩니다.`,
      ].join('\n')
    );
  }
  console.log('─'.repeat(58));
  console.log('\n다음: 사장님이 로그인하면 온보딩(매장 정보 입력)이 자동으로 뜹니다.');
}

main().catch((e) => {
  console.error('초대 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
