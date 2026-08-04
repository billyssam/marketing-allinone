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
 *   2) 확인메일이 켜져 있는데 커스텀 SMTP가 없는 상태인가 (내장 메일=시간당 2통, 팀 외 발송 거부)
 *
 * 사용법: npx tsx src/check-auth-config.ts
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (선택) PILOT_APP_URL
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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

/** 2) 확인메일 ON + 내장 SMTP 조합인지 — 이 조합이면 사장님 자가가입이 막힌다 */
async function checkEmailDeliverability() {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
  if (!res.ok) {
    problems.push(`인증 설정 조회 실패: HTTP ${res.status}`);
    return;
  }
  const settings = (await res.json()) as { mailer_autoconfirm?: boolean };
  const confirmRequired = settings.mailer_autoconfirm === false;

  if (!confirmRequired) {
    console.log('✅ 확인메일 OFF — 가입이 메일 도달에 의존하지 않음');
    return;
  }

  // 커스텀 SMTP 연결 여부는 공개 설정 어디에도 없다.
  // 발송 한도(429)로 추론하면 "마침 한도가 회복된 순간"에는 통과해버려 신호가 흔들린다
  // — 실제로 첫 실행이 그렇게 나왔다. 그래서 추론 대신 **명시 플래그**로 판정한다.
  // SMTP를 붙인 사람이 CUSTOM_SMTP_CONFIGURED=true를 켜기 전까지는 막힌 것으로 본다.
  if (process.env.CUSTOM_SMTP_CONFIGURED === 'true') {
    console.log('✅ 확인메일 ON + 커스텀 SMTP 연결됨 — 자가가입 가능');
    return;
  }

  // 참고용 실측(판정에는 쓰지 않고 근거로만 덧붙임)
  const probe = await fetch(`${url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: key!, Authorization: `Bearer ${key!}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `deliver-check-${Date.now()}@example.com` }),
  });
  const evidence =
    probe.status === 429
      ? '현재 한도 소진 상태(429 over_email_send_rate_limit) — 지금 가입하면 즉시 실패'
      : '현재는 한도 여유가 있으나 시간당 2통이라 사장님 2~3분만 몰려도 즉시 막힘';

  problems.push(
    [
      `확인메일 ON인데 커스텀 SMTP 미연결 → 사장님 자가가입이 막힌다`,
      `  근거: 내장 메일 서비스는 프로젝트 전체 시간당 2통이고 팀 외 주소로는 발송을 거부한다.`,
      `        ${evidence}`,
      `        (실측: 가입 요청이 429로 거절되면 계정 자체가 생성되지 않음)`,
      `  조치(둘 중 하나):`,
      `    A. 커스텀 SMTP 연결(Resend 등) 후 CUSTOM_SMTP_CONFIGURED=true 설정 — 근본 해결`,
      `    B. 파일럿은 초대 방식으로 진행: npx tsx src/invite-owner.ts <이메일> <이름>`,
    ].join('\n')
  );
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
  console.log('\n✅ 인증 설정 이상 없음');
}

main().catch((e) => {
  console.error('점검 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
