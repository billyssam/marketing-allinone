/**
 * 파일럿 준비 점검 — "지금 사장님을 받아도 되는가"를 한 번에 확인한다.
 *
 * 왜 필요한가: 검증이 여러 스크립트에 흩어져 있어 매번 무엇을 돌려야 하는지 기억해야 했다.
 * 파일럿 당일과 그 이후 매일, 이 하나만 돌리면 된다.
 * 각 항목은 **막는 것(🔴)과 알아두면 되는 것(⚠️)을 구분**한다 —
 * 전부 빨간불이면 무엇이 진짜 문제인지 알 수 없다.
 *
 * 사용법: npx tsx src/preflight.ts
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { contentChannelsFor } from '../../shared/channels/registry';
import { checkPosts, criticalOf } from '../../shared/content-engine/quality';
import { authConfigurationProblems } from '../../shared/auth-health';
import { storeLabel } from './mask';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.PILOT_APP_URL ?? 'https://marketing-allinone.vercel.app';
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

type Level = 'ok' | 'warn' | 'block';
const results: { level: Level; name: string; detail: string }[] = [];
const add = (level: Level, name: string, detail: string) => results.push({ level, name, detail });

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const kstTodayStart = () => new Date(Math.floor((Date.now() + KST) / DAY) * DAY - KST).toISOString();

async function checkService() {
  try {
    const res = await fetch(`${APP}/api/health`, { signal: AbortSignal.timeout(15000) });
    const j = (await res.json()) as { ok?: boolean; db?: boolean };
    if (res.ok && j.ok && j.db) add('ok', '서비스', `${APP} 정상 (DB 연결 확인)`);
    else add('block', '서비스', `헬스체크 실패: HTTP ${res.status} ${JSON.stringify(j)}`);
  } catch (e) {
    add('block', '서비스', `접속 불가: ${e instanceof Error ? e.message : e}`);
  }
}

async function checkAuth() {
  const response = await fetch(url + '/auth/v1/settings', { headers: { apikey: key! }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) add('block', '인증 설정', 'Auth 설정을 읽지 못했습니다');
  else {
    const settings = await response.json();
    for (const problem of authConfigurationProblems(settings, { signupMode: process.env.OWNER_SIGNUP_MODE, smtpDeclared: process.env.CUSTOM_SMTP_CONFIGURED === 'true' })) add('block', '인증 설정', problem);
  }
  // 리다이렉트 허용목록 — 틀리면 초대 링크가 죽는다(화면으로는 안 보인다)
  const probeEmail = `preflight-${Date.now()}@example.com`;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: probeEmail,
    password: `pf-${Date.now()}-x`,
    email_confirm: true,
  });
  if (error || !created?.user) {
    add('warn', '인증', `확인 불가(임시 계정 생성 실패): ${error?.message ?? '?'}`);
    return;
  }
  try {
    const { data } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: probeEmail,
      options: { redirectTo: `${APP}/auth/callback?next=/reset-password` },
    });
    const link = data?.properties?.action_link ?? '';
    const target = link ? new URL(link).searchParams.get('redirect_to') : null;
    const ok = !!target && new URL(target).origin === new URL(APP).origin;
    if (ok) add('ok', '초대 링크', '리다이렉트 허용목록 정상 — 링크 한 번으로 입장');
    else add('block', '초대 링크', `허용목록에 운영 주소 없음 → ${target ? decodeURIComponent(target) : '(없음)'}`);
  } finally {
    await supabase.auth.admin.deleteUser(created.user.id);
  }
}

async function checkStores() {
  const { data: stores } = await supabase.from('stores').select('id,name,industry_id,naver_place_url,brand_tone,onboarded_at');
  if (!stores?.length) {
    add('warn', '매장', '등록된 매장 0곳 — 초대 전이면 정상');
    return;
  }
  const todayStart = kstTodayStart();
  for (const s of stores) {
    const { data: conns } = await supabase.from('channel_connections').select('channel_id').eq('store_id', s.id);
    const channels = contentChannelsFor((conns ?? []).map((c) => c.channel_id as string));
    const tone = (s.brand_tone ?? {}) as { place_facts?: { menu?: unknown[]; crawled_at?: string }; offerings?: unknown[] };
    const facts = (tone.place_facts?.menu?.length ?? 0) + (tone.offerings?.length ?? 0);

    // 오늘 초안 + 품질
    const { data: todays } = await supabase
      .from('posts')
      .select('channel,title,body_plain,metadata')
      .eq('store_id', s.id)
      .gte('created_at', todayStart)
      // 보관된 초안은 사장님 화면에 없다 — 이걸 같이 검사하면 재생성 뒤에 옛 글 때문에
      // 게이트가 빨간불로 남는다(2026-08-13 실측). 오탐 나는 게이트는 아무도 안 본다.
      .neq('status', 'archived')
      .contains('metadata', { auto: 'daily' });

    const joinedToday = Date.parse((s.onboarded_at as string) ?? '') >= Date.parse(todayStart);
    if (!todays?.length) {
      if (joinedToday) add('warn', `매장 · ${storeLabel(s)}`, '오늘 가입 — 웰컴 초안 실제 생성 여부를 확인해야 함');
      else add('block', `매장 · ${storeLabel(s)}`, '오늘 자동 초안 없음');
    } else {
      const issues = checkPosts(
        todays.map((p) => ({
          channel: p.channel as string,
          title: p.title as string | null,
          bodyPlain: p.body_plain as string | null,
          titleStyle: (p.metadata as { titleStyle?: string } | null)?.titleStyle ?? null,
        })),
        s.name as string,
        { storeHasFacts: facts > 0 },
      );
      // 무게를 구분한다 — preflight는 사람이 보면서 파일럿 준비를 판단하는 화면이라
      // '지금 막아야 할 것'과 '고쳐두면 좋은 것'이 같은 빨간불이면 우선순위가 사라진다.
      const crit = criticalOf(issues);
      const warns = issues.filter((i) => i.severity === 'warn');
      if (crit.length) {
        add('block', `매장 · ${storeLabel(s)}`, `그대로 내보내면 안 되는 결함 ${crit.length}건: ${crit.map((i) => `${i.rule}`).join(',')}`);
      }
      if (warns.length) {
        add('warn', `매장 · ${storeLabel(s)}`, `고쳐야 할 것 ${warns.length}건: ${warns.map((i) => `${i.rule}`).join(',')}`);
      }
      if (!issues.length) add('ok', `매장 · ${storeLabel(s)}`, `채널 ${channels.length} · 오늘 초안 ${todays.length} · 품질 통과`);
    }

    if (!s.naver_place_url) add('warn', `매장 · ${storeLabel(s)}`, '플레이스 미연결 — 리뷰 수집·사실 주입 불가');
    else if (!tone.place_facts) add('warn', `매장 · ${storeLabel(s)}`, '플레이스 크롤 아직 없음(다음 크론에서 수집)');
  }
}

async function checkQuota() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) { add('block', 'AI 연결', '생성용 키가 없습니다'); return; }
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) { add('block', 'AI 연결', '모델 목록 조회 실패: HTTP ' + response.status); return; }
  const payload = await response.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const ready = payload.models?.some((model) => model.name === 'models/gemini-2.5-flash' && model.supportedGenerationMethods?.includes('generateContent'));
  if (!ready) add('block', 'AI 연결', '설정한 생성 모델을 사용할 수 없습니다');
  else add('warn', 'AI 한도', '키·모델 조회 정상. 실제 생성 성공·남은 쿼터·청구 용량은 이 조회로 증명하지 않습니다. 매장 수로 무료 한도 여유를 단정하지 않습니다');
}

async function main() {
  console.log(`파일럿 준비 점검 — ${APP}\n`);
  await checkService();
  await checkAuth();
  await checkStores();
  await checkQuota();

  const icon = { ok: '✅', warn: '⚠️ ', block: '🔴' } as const;
  for (const r of results) console.log(`${icon[r.level]} ${r.name.padEnd(18)} ${r.detail}`);

  const blocks = results.filter((r) => r.level === 'block');
  const warns = results.filter((r) => r.level === 'warn');
  console.log(`\n막는 것 ${blocks.length} · 알아둘 것 ${warns.length}`);
  if (blocks.length) {
    console.error('\n🔴 이 상태로는 파일럿을 열면 안 됩니다:');
    for (const b of blocks) console.error(`   ${b.name} — ${b.detail}`);
    process.exit(1);
  }
  console.log('\n✅ 검사한 필수 항목 통과. 경고 및 실기기·메일·외부 게시 검증은 별도 확인해야 합니다.');
}

main().catch((e) => {
  console.error('점검 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
