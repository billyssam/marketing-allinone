/**
 * 리뷰 모니터링 크론 진입점 (Oracle VM에서 하루 1~2회 실행).
 *
 * 사용법:
 *   # DB 없이 크롤+분석만 검증 (파일럿 매장)
 *   npx tsx src/crawl-reviews.ts --dry --place=1565864790 --store=쿵더쿵
 *
 *   # 실운영: Supabase의 place URL 있는 매장 전부 동기화 + 부정리뷰 텔레그램 알림
 *   npx tsx src/crawl-reviews.ts
 *
 * env (실운영): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *               TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (알림 없으면 생략 가능)
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { crawlNaverPlaceReviews } from '../../shared/content-engine/review-crawler.js';
import { analyzeReview } from '../../shared/content-engine/review-analyzer.js';
import { syncStoreReviews, markNegativesNotified, type StoreForReview } from './reviews.js';

// web/.env.local 재사용 (백엔드 자체 .env 없어도 동작)
loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv(); // backend/.env 있으면 덮어씀

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => args.find((a) => a.startsWith(`${f}=`))?.split('=').slice(1).join('=');

const SENT_EMOJI: Record<string, string> = { positive: '😊', neutral: '😐', negative: '⚠️' };

async function dryRun() {
  const placeId = val('--place') ?? '1565864790';
  const storeName = val('--store') ?? '쿵더쿵';
  console.log(`\n🔎 DRY RUN — place ${placeId} (${storeName}) — DB 저장 없음\n`);

  const reviews = await crawlNaverPlaceReviews(placeId, { limit: Number(val('--limit') ?? 15) });
  console.log(`크롤: ${reviews.length}건\n`);

  const tally = { positive: 0, neutral: 0, negative: 0 };
  for (const r of reviews) {
    const a = analyzeReview(r, storeName);
    tally[a.sentiment]++;
    console.log(`${SENT_EMOJI[a.sentiment]} [${a.sentiment}] (${a.score}) ${r.author} · ${r.visitedAt ?? '날짜?'} ${r.receiptVerified ? '🧾' : ''}`);
    console.log(`   "${r.content.slice(0, 90)}${r.content.length > 90 ? '…' : ''}"`);
    if (r.keywords.length) console.log(`   키워드: ${r.keywords.join(', ')}`);
    if (a.signals.negative.length) console.log(`   ⚠️ 부정신호: ${a.signals.negative.join(', ')}`);
    console.log(`   💬 답글초안: ${a.replyDraft}\n`);
  }
  console.log(`\n감정 분포 → 긍정 ${tally.positive} · 중립 ${tally.neutral} · 부정 ${tally.negative}`);
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return res.ok;
}

async function liveRun() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (web/.env.local 확인)');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, naver_place_url')
    .not('naver_place_url', 'is', null);
  if (error) {
    console.error('❌ stores 조회 실패:', error.message);
    process.exit(1);
  }
  if (!stores?.length) {
    console.log('플레이스 URL 등록된 매장이 없습니다. 종료.');
    return;
  }

  console.log(`📋 대상 매장 ${stores.length}곳\n`);
  let totalNeg = 0;
  for (const s of stores as StoreForReview[]) {
    const r = await syncStoreReviews(supabase, s);
    if (r.error) {
      console.log(`[${r.storeName}] ⚠️ ${r.error}`);
      continue;
    }
    console.log(
      `[${r.storeName}] 크롤 ${r.crawled} · 저장 ${r.upserted} · ` +
        `긍정 ${r.bySentiment.positive}/중립 ${r.bySentiment.neutral}/부정 ${r.bySentiment.negative} · ` +
        `알림대기 부정 ${r.pendingNegatives.length}`,
    );

    // 부정 리뷰 텔레그램 알림 → 성공 시 통보 마킹
    if (r.pendingNegatives.length > 0) {
      const lines = r.pendingNegatives
        .slice(0, 5)
        .map(
          (n, i) =>
            `${i + 1}. <b>${n.author ?? '익명'}</b>: ${n.content.slice(0, 80)}\n   💬 <i>${(n.replyDraft ?? '').slice(0, 90)}</i>`,
        );
      const msg =
        `⚠️ <b>${r.storeName}</b> 부정 리뷰 ${r.pendingNegatives.length}건 감지\n\n` +
        lines.join('\n\n') +
        `\n\n대시보드에서 답글 확인 →`;
      const sent = await sendTelegram(msg);
      if (sent) {
        await markNegativesNotified(supabase, r.pendingNegatives.map((n) => n.id));
        console.log(`   ✅ 텔레그램 알림 발송 + 통보 마킹`);
      } else {
        console.log(`   ℹ️ 텔레그램 미설정(TELEGRAM_BOT_TOKEN/CHAT_ID) — 알림 생략, 다음 실행에 재시도`);
      }
      totalNeg += r.pendingNegatives.length;
    }
  }
  console.log(`\n완료. 신규 부정 리뷰 알림 대상 총 ${totalNeg}건.`);
}

async function main() {
  if (has('--dry')) await dryRun();
  else await liveRun();
}

main().catch((e) => {
  console.error('❌ 실행 실패:', e.message);
  process.exit(1);
});
