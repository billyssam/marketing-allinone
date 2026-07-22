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
import { createClient } from '@supabase/supabase-js';
import { contentChannelsFor } from '../../shared/channels/registry';

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
  const { data: stores, error } = await supabase.from('stores').select('id,name');
  if (error) throw error;
  if (!stores?.length) {
    console.log('매장 0 — 검증할 것 없음');
    return;
  }

  const todayStart = kstTodayStartIso();
  let checked = 0;
  const missing: string[] = [];

  for (const s of stores) {
    // 콘텐츠 채널이 하나라도 연결된 매장만 SLA 대상 (연결 = 행 존재, generate-daily와 동일 기준)
    const { data: conns } = await supabase
      .from('channel_connections')
      .select('channel_id')
      .eq('store_id', s.id);
    const channels = contentChannelsFor((conns ?? []).map((c) => c.channel_id as string));
    if (!channels.length) continue;

    checked++;
    const { data: todays } = await supabase
      .from('posts')
      .select('id')
      .eq('store_id', s.id)
      .gte('created_at', todayStart)
      .contains('metadata', { auto: 'daily' })
      .limit(1);
    if (!todays?.length) missing.push(s.name);
  }

  console.log(`검증 매장 ${checked} · 오늘 초안 누락 ${missing.length}`);
  if (missing.length) {
    console.error(`❌ 오늘 자동 초안이 없는 매장: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ 모든 연결 매장에 오늘 초안 준비됨');
}

main().catch((e) => {
  console.error('❌ 검증 실행 실패:', e.message);
  process.exit(1);
});
