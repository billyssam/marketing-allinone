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
import { configurePush, pushToOwner } from './push.js';
import { storeLabel } from './mask.js';

/** 알림 클릭 시 열 주소 — 리뷰 화면으로 바로 보낸다 */
const APP_URL = process.env.PILOT_APP_URL ?? 'https://marketing-allinone.vercel.app';
/** VAPID 키가 없으면 사장님 알림은 건너뛴다(텔레그램·대시보드 경고는 그대로) */
const pushReady = configurePush();

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
    // owner_id — 부정 리뷰를 **사장님 폰으로** 보내려면 필요하다(아래 설명 참고)
    .select('id, name, naver_place_url, owner_id')
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
  let failed = 0;
  for (const s of stores as StoreForReview[]) {
    // 매장별 격리 — syncStoreReviews 안의 crawlNaverPlaceReviews(Playwright)는
    // 플레이스 주소 변경·네이버 차단·타임아웃에 그냥 throw한다.
    // 감싸지 않으면 **매장 하나 때문에 그 회차 전 매장 리뷰 수집이 죽는다**
    // (파일럿 8매장이면 한 곳만 삐끗해도 나머지 7곳이 리뷰를 못 받는다).
    let r: Awaited<ReturnType<typeof syncStoreReviews>>;
    try {
      r = await syncStoreReviews(supabase, s);
    } catch (e) {
      failed++;
      console.log(`[${storeLabel(s)}] ⚠️ 크롤 실패(건너뜀): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (r.error) {
      failed++;
      console.log(`[${storeLabel(s)}] ⚠️ ${r.error}`);
      continue;
    }
    console.log(
      `[${storeLabel(s)}] 크롤 ${r.crawled} · 저장 ${r.upserted} · ` +
        `긍정 ${r.bySentiment.positive}/중립 ${r.bySentiment.neutral}/부정 ${r.bySentiment.negative} · ` +
        `알림대기 부정 ${r.pendingNegatives.length}`,
    );

    /**
     * 부정 리뷰 알림.
     *
     * 예전엔 **운영자 텔레그램·GitHub 이슈로만** 갔다. 사장님은 대시보드를 열어야 알았고,
     * 그러면 크롤을 아무리 자주 돌려도 "알림 지연"은 줄지 않는다 —
     * 실제로 저녁 리뷰가 다음날 아침까지 15시간 방치됐다(2026-08-19 실측).
     * 그래서 **사장님 폰으로 직접** 보낸다(웹 푸시). 텔레그램은 운영자 보조로 남긴다.
     *
     * `owner_notified_at`은 이름 그대로 **사장님에게 알린 시각**이어야 한다 →
     * 푸시가 갔으면 그걸로 마킹한다. 구독이 아직 없으면(초기엔 대부분) 예전처럼
     * 텔레그램 성공을 기준으로 마킹한다 — 운영자가 카톡으로 전달하는 전제다.
     * 둘 다 실패하면 마킹하지 않고 다음 회차가 다시 시도한다(조용히 사라지지 않게).
     */
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

      let notified = false;

      if (pushReady && s.owner_id) {
        const n = r.pendingNegatives.length;
        const first = r.pendingNegatives[0];
        const res = await pushToOwner(supabase, s.owner_id, {
          title: `${r.storeName} · 아쉬운 리뷰 ${n}건`,
          // 원문을 조금 보여준다 — 열어보게 만드는 건 숫자가 아니라 손님의 말이다
          body: n === 1 ? `"${first.content.slice(0, 60)}" 답글 초안이 준비돼 있어요.` : `답글 초안이 준비돼 있어요. 빨리 답할수록 좋습니다.`,
          tag: 'negative-review',
          url: `${APP_URL}/reviews`,
        });
        if (res.sent > 0) {
          notified = true;
          console.log(`   📱 사장님 알림 발송 ${res.sent}건${res.gone ? ` (만료 구독 ${res.gone}건 정리)` : ''}`);
        } else if (res.failed > 0) {
          console.log(`   ⚠️ 사장님 알림 실패 ${res.failed}건 — 다음 회차 재시도`);
        }
      }

      const sent = await sendTelegram(msg);
      if (sent) console.log('   ✅ 운영자 텔레그램 발송');
      if (notified || sent) {
        await markNegativesNotified(supabase, r.pendingNegatives.map((n) => n.id));
        console.log('   ✅ 통보 마킹');
      } else {
        console.log('   ℹ️ 사장님 구독·텔레그램 모두 없음 — 알림 생략, 다음 회차 재시도(대시보드 경고는 계속 뜸)');
      }
      totalNeg += r.pendingNegatives.length;
    }
  }
  console.log(`\n완료 — 매장 ${stores.length}곳 · 실패 ${failed} · 신규 부정 리뷰 알림 대상 총 ${totalNeg}건.`);
  // 전부 처리한 뒤에 실패를 알린다. 조용히 성공으로 끝나면 어느 매장이 몇 주째
  // 리뷰를 못 받고 있는지 아무도 모른다(하루 3회라 다음 회차 자가치유 여지도 있음).
  if (failed > 0) {
    throw new Error(`${stores.length}곳 중 ${failed}곳 리뷰 수집 실패 — 로그의 매장별 사유 확인`);
  }
}

async function main() {
  if (has('--dry')) await dryRun();
  else await liveRun();
}

main().catch((e) => {
  console.error('❌ 실행 실패:', e.message);
  process.exit(1);
});
