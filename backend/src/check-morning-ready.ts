/**
 * 아침 준비 상태 검증 (비즈니스 SLA) — 매일 09:30 KST 크론.
 *
 * "크론이 성공했는가"가 아니라 **"사장님 아침에 초안이 실제로 있는가"**를 DB로 직접 확인.
 * 콘텐츠 채널이 연결된 매장인데 오늘 자동 초안(auto:daily)이 0건이면 exit 1
 * → 워크플로가 이슈 알림. (크론 성공+생성 0건 같은 조용한 구멍까지 잡는 최종 방어선)
 *
 * 사용법: npx tsx src/check-morning-ready.ts
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { contentChannelsFor } from '../../shared/channels/registry';
import { checkPosts } from '../../shared/content-engine/quality';

// 로컬 수동 실행 지원 — 다른 운영 스크립트와 동일한 경로에서 env 로드.
// (CI는 워크플로가 env를 주입하므로 크론은 이전에도 정상이었지만, docs/ops.md가
//  안내하는 "수동 점검 명령"이 로컬에서 실패하고 있었다.)
loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** 오늘 00:00 KST의 UTC ISO */
function kstTodayStartIso(): string {
  const nowKstMs = Date.now() + 9 * 3600_000;
  const dayMs = 86_400_000;
  return new Date(Math.floor(nowKstMs / dayMs) * dayMs - 9 * 3600_000).toISOString();
}

async function main() {
  const { data: stores, error } = await supabase.from('stores').select('id,name,onboarded_at,created_at,brand_tone');
  if (error) throw error;
  if (!stores?.length) {
    console.log('매장 0 — 검증할 것 없음');
    return;
  }

  const todayStart = kstTodayStartIso();
  let checked = 0;
  const missing: string[] = [];
  const badQuality: string[] = [];

  for (const s of stores) {
    // 콘텐츠 채널이 하나라도 연결된 매장만 SLA 대상 (연결 = 행 존재, generate-daily와 동일 기준)
    const { data: conns } = await supabase
      .from('channel_connections')
      .select('channel_id')
      .eq('store_id', s.id);
    const channels = contentChannelsFor((conns ?? []).map((c) => c.channel_id as string));
    if (!channels.length) continue;

    // 오늘 가입한 매장은 아직 데일리 크론(07:30)을 한 번도 안 거쳤다.
    // 그 자리는 온보딩 직후 만들어지는 **웰컴 초안**이 채운다.
    // 이걸 빼지 않으면 파일럿 사장님이 가입하는 날마다 거짓 알림이 뜬다(실측).
    const joinedAt = (s.onboarded_at ?? s.created_at) as string | null;
    if (joinedAt && Date.parse(joinedAt) >= Date.parse(todayStart)) {
      console.log(`[${s.name}] 오늘 가입 — 데일리 SLA 대상 아님(웰컴 초안이 담당)`);
      continue;
    }

    checked++;
    const { data: todays } = await supabase
      .from('posts')
      .select('channel, title, body_plain, metadata')
      .eq('store_id', s.id)
      .gte('created_at', todayStart)
      // 보관분 제외 — 사장님 화면에 없는 글로 SLA를 판정하면 오탐이 난다(2026-08-13 실측)
      .neq('status', 'archived')
      .contains('metadata', { auto: 'daily' });
    if (!todays?.length) {
      missing.push(s.name);
      continue;
    }

    // "있는가"에 더해 "쓸 만한가"까지 본다.
    // 크론은 성공으로 찍히고 초안도 있는데 **내용이 나쁜** 일이 실제로 반복됐다
    // (단문 채널 사실 0건·분량 절반 붕괴·상호 조사 오류). 며칠씩 사람이 못 볼 때가 있어
    // 사람 눈 대신 규칙으로 매일 확인한다.
    // 매장이 가진 사실이 있는지 — 없으면 사실 주입을 요구하지 않는다(고칠 수 없는 지적이 된다)
    const tone = (s.brand_tone ?? {}) as { place_facts?: { menu?: unknown[] }; offerings?: unknown[] };
    const storeHasFacts =
      (tone.place_facts?.menu?.length ?? 0) > 0 || (tone.offerings?.length ?? 0) > 0;

    const issues = checkPosts(
      todays.map((p) => ({
        channel: p.channel as string,
        title: p.title as string | null,
        bodyPlain: p.body_plain as string | null,
        titleStyle: (p.metadata as { titleStyle?: string } | null)?.titleStyle ?? null,
      })),
      s.name,
      { storeHasFacts },
    );
    if (issues.length) {
      badQuality.push(`${s.name}: ${issues.map((i) => `[${i.channel}] ${i.rule} — ${i.detail}`).join(' / ')}`);
    }
  }

  console.log(`검증 매장 ${checked} · 오늘 초안 누락 ${missing.length} · 품질 이상 ${badQuality.length}`);
  if (missing.length) {
    console.error(`❌ 오늘 자동 초안이 없는 매장: ${missing.join(', ')}`);
  }
  if (badQuality.length) {
    console.error('❌ 초안 품질 이상:');
    for (const b of badQuality) console.error(`   ${b}`);
  }
  // 누락과 품질을 **함께** 판단한다 — 하나만 먼저 exit하면 나머지가 가려진다
  if (missing.length || badQuality.length) process.exit(1);
  console.log('✅ 모든 연결 매장에 오늘 초안 준비됨 (품질 점검 통과)');
}

main().catch((e) => {
  console.error('❌ 검증 실행 실패:', e.message);
  process.exit(1);
});
