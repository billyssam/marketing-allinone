/**
 * 인증 설정 건전성 점검 — "가입·로그인·비밀번호 재설정이 운영에서 실제로 되는가".
 *
 * 왜 필요한가(실측으로 드러난 사고):
 *   Supabase는 리다이렉트 허용목록에 없는 주소를 **에러 없이 Site URL로 바꿔치기**한다.
 *   운영 주소를 넘겼는데 redirect_to=http://localhost:3000이 돌아왔다 — 코드는 정상,
 *   응답도 200, 그런데 사장님이 받는 메일 링크는 전부 죽는다. 화면·테스트·빌드
 *   어디에도 안 잡히는 종류의 결함이라 **설정 자체를 주기적으로 실측**해야 한다.
 *
 * 점검 항목
 *   1) 리다이렉트 허용목록에 운영 주소가 있는가 (없으면 재설정/가입확인/OAuth 전부 깨짐)
 *   2) 초대 전용 선언과 실제 공개 가입 차단 상태가 일치하는가
 *   3) 가입 모드와 무관하게 운영 메일 준비가 확인됐는가 (실제 수신은 별도)
 *
 * 사용법: npx tsx src/check-auth-config.ts
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (선택) PILOT_APP_URL
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { authConfigurationProblems, type AuthHealthSettings } from '../../shared/auth-health';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.PILOT_APP_URL ?? 'https://marketing-allinone.vercel.app';
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const problems: string[] = [];

/** 1) 운영 주소가 리다이렉트 허용목록에 있는지 — 임시 계정으로 실제 링크를 뽑아 확인 */
async function checkRedirectAllowList() {
  // 실제 사장님 계정을 건드리지 않도록 일회용 계정을 만들고 즉시 지운다.
  // example.com은 예약 도메인이라 어떤 경우에도 메일이 나가지 않는다.
  const probeEmail = `authcheck-${Date.now()}@example.com`;
  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email: probeEmail,
    password: `chk-${Date.now()}-x`,
    email_confirm: true,
  });
  if (cErr || !created?.user) {
    problems.push(`허용목록 점검 불가 — 임시 계정 생성 실패: ${cErr?.message ?? 'unknown'}`);
    return;
  }

  try {
    const wanted = `${appUrl}/auth/callback?next=/reset-password`;
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: probeEmail,
      options: { redirectTo: wanted },
    });
    if (error) {
      problems.push(`허용목록 점검 불가 — 링크 생성 실패: ${error.message}`);
      return;
    }
    const link = data.properties?.action_link ?? '';
    const actual = link ? new URL(link).searchParams.get('redirect_to') : null;
    const ok = !!actual && new URL(actual).origin === new URL(appUrl).origin;
    if (ok) {
      console.log(`✅ 리다이렉트 허용목록 — 운영 주소 정상 (${new URL(appUrl).origin})`);
    } else {
      // 토큰이 포함된 링크 전체는 절대 출력하지 않는다(CI 로그에 남으면 그 자체가 사고).
      problems.push(
        [
          `리다이렉트 허용목록에 운영 주소가 없음 → 실제 redirect_to=${actual ? decodeURIComponent(actual) : '(없음)'}`,
          `  영향: 비밀번호 재설정 메일·가입 확인 메일·카카오/구글 OAuth 콜백이 전부 죽은 주소로 감`,
          `  조치: Supabase → Authentication → URL Configuration`,
          `        Site URL = ${appUrl}`,
          `        Redirect URLs에 ${appUrl}/** 추가`,
        ].join('\n')
      );
    }
  } finally {
    await supabase.auth.admin.deleteUser(created.user.id);
  }
}

/** 메일 설정 선언과 실제 가입 설정 대조. 공개 settings로 SMTP 구성을 추측하지 않는다. */
async function checkEmailDeliverability() {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
  if (!res.ok) {
    problems.push(`인증 설정 조회 실패: HTTP ${res.status}`);
    return;
  }
  const settings = (await res.json()) as AuthHealthSettings;
  problems.push(...authConfigurationProblems(settings, {
    signupMode: process.env.OWNER_SIGNUP_MODE,
    smtpDeclared: process.env.CUSTOM_SMTP_CONFIGURED === 'true',
  }));
  console.log('가입 설정: ' + (settings.disable_signup === true ? '공개 가입 닫힘' : '공개 가입 열림'));
  console.log('확인메일: ' + (settings.mailer_autoconfirm === false ? '필수' : '생략'));
  if (process.env.CUSTOM_SMTP_CONFIGURED === 'true') {
    console.log('SMTP 준비는 운영자 등록값입니다. 이 검사는 실제 메일 수신을 증명하지 않습니다.');
  }
}

async function main() {
  console.log(`인증 설정 점검 — ${appUrl}\n`);
  await checkRedirectAllowList();
  await checkEmailDeliverability();

  if (problems.length) {
    console.error(`\n🔴 인증 설정 문제 ${problems.length}건\n`);
    problems.forEach((p, i) => console.error(`${i + 1}. ${p}\n`));
    process.exit(1);
  }
  console.log('\n✅ 인증 설정 선언·허용목록 검사 통과 (실제 메일 수신은 별도 검증)');
}

main().catch((e) => {
  console.error('점검 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
