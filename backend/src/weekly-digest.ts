/**
 * 주간 다이제스트 — 전 매장 주간 리포트를 한 번에 뽑는다(운영자용).
 *
 * 왜 필요한가: /report 화면을 만들어도 사장님이 안 들어오면 안 보인다.
 * 파일럿 규모(수 매장)에서 가장 확실한 전달 경로는 **운영자가 월요일에 카톡으로 보내주는 것**이고,
 * 그러려면 매장별 요약이 복사 가능한 형태로 한 곳에 모여 있어야 한다.
 * 알림톡·텔레그램 credential이 없어도 오늘 당장 되는 방식이다.
 *
 * 사용법: npx tsx src/weekly-digest.ts
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 출력: 매장별 평문 요약(그대로 카톡에 붙여넣기) + 운영자용 한 줄 상태
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildWeeklyReport, type ReportPost, type ReportReview } from '../../shared/weekly-report';

// quiet 필수 — 이 스크립트의 stdout은 **운영자가 그대로 복사해 카톡에 붙이는 내용**이다.
// dotenv의 "injected env" 안내 2줄이 복사 블록에 섞여 들어갔다(실측).
loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const SEP = '─'.repeat(52);

async function main() {
  const { data: stores, error } = await supabase.from('stores').select('id, name').order('name');
  if (error) throw error;
  if (!stores?.length) {
    console.log('매장 0곳 — 보낼 것 없음');
    return;
  }

  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const nowMs = Date.now();
  const summaries: string[] = [];

  for (const s of stores) {
    const [postsRes, reviewsRes] = await Promise.all([
      supabase
        .from('posts')
        .select('created_at, published_at, status, channel')
        .eq('store_id', s.id)
        .gte('created_at', since)
        .limit(500),
      // 리뷰는 기간으로 자르지 않는다 — 미답변은 누적 기준(화면과 동일)
      supabase
        .from('reviews')
        .select('crawled_at, posted_at, sentiment, reply_sent_at')
        .eq('store_id', s.id)
        .limit(500),
    ]);

    const report = buildWeeklyReport(
      s.name,
      (postsRes.data ?? []) as ReportPost[],
      (reviewsRes.data ?? []) as ReportReview[],
      nowMs,
    );

    // 운영자가 먼저 보는 한 줄 — 손 볼 매장을 바로 알아채게
    const urgent = report.todos.filter((t) => t.urgent).length;
    const flag = urgent > 0 ? '🔴' : report.todos.length > 0 ? '⚠️' : '✅';
    summaries.push(
      [
        SEP,
        `${flag} ${s.name} — ${report.stats.map((x) => `${x.label} ${x.value}`).join(' · ')}`,
        SEP,
        report.plainText,
      ].join('\n'),
    );
  }

  console.log(`주간 다이제스트 · 매장 ${stores.length}곳\n`);
  console.log(summaries.join('\n\n'));
  console.log(`\n${SEP}\n각 블록의 평문을 그대로 사장님 카톡에 붙여넣으시면 됩니다.`);
}

main().catch((e) => {
  console.error('다이제스트 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
