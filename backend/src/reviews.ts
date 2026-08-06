import type { SupabaseClient } from '@supabase/supabase-js';
import { crawlNaverPlaceReviews, extractPlaceId } from '../../shared/content-engine/review-crawler.js';
import { analyzeReview, type Sentiment } from '../../shared/content-engine/review-analyzer.js';

/**
 * 리뷰 모니터링 파이프라인 — 크롤 → 감정분석 → 답글초안 → reviews 테이블 upsert.
 * Oracle VM 크롤 워커에서 실행(Vercel 서버리스는 Chromium 없음).
 *
 * 멱등: unique(store_id, source, external_id) 기준 upsert.
 * reply_sent_at / owner_notified_at 컬럼은 payload에 넣지 않아 재실행해도 보존됨.
 */

export interface StoreForReview {
  id: string;
  name: string;
  naver_place_url?: string | null;
  place_id?: string | null;
}

export interface SyncReviewsResult {
  storeId: string;
  storeName: string;
  placeId: string | null;
  crawled: number;
  upserted: number;
  bySentiment: Record<Sentiment, number>;
  /** 아직 사장님에게 알림 안 간 부정 리뷰 (알림 대상) */
  pendingNegatives: {
    id: string;
    author: string | null;
    content: string;
    replyDraft: string | null;
  }[];
  error?: string;
}

export async function syncStoreReviews(
  supabase: SupabaseClient,
  store: StoreForReview,
  opts: { limit?: number } = {},
): Promise<SyncReviewsResult> {
  const placeId = store.place_id ?? extractPlaceId(store.naver_place_url ?? '');
  const base: SyncReviewsResult = {
    storeId: store.id,
    storeName: store.name,
    placeId,
    crawled: 0,
    upserted: 0,
    bySentiment: { positive: 0, neutral: 0, negative: 0 },
    pendingNegatives: [],
  };

  if (!placeId) {
    return { ...base, error: '네이버 플레이스 ID 없음 (place_id/naver_place_url 확인)' };
  }

  const crawled = await crawlNaverPlaceReviews(placeId, { limit: opts.limit ?? 20 });
  base.crawled = crawled.length;
  if (crawled.length === 0) return base;

  const rows = crawled.map((r) => {
    const a = analyzeReview(r, store.name);
    base.bySentiment[a.sentiment]++;
    return {
      store_id: store.id,
      source: 'naver_place' as const,
      external_id: r.externalId,
      author_display: r.author,
      rating: null,
      content: r.content,
      posted_at: r.visitedAt ? `${r.visitedAt}T00:00:00+09:00` : null,
      sentiment: a.sentiment,
      sentiment_score: a.score,
      reply_draft: a.replyDraft,
    };
  });

  const { data, error } = await supabase
    .from('reviews')
    .upsert(rows, { onConflict: 'store_id,source,external_id' })
    .select('id, sentiment');
  if (error) return { ...base, error: `reviews upsert 실패: ${error.message}` };
  base.upserted = data?.length ?? 0;

  // 알림 대기 부정 리뷰: 부정 + 아직 미통보 + **아직 답글도 안 단** 것.
  // reply_sent_at을 안 보면, 사장님이 답글을 달아 이미 해결했는데도
  // 통보 기록이 없다는 이유로 영원히 알림 대상에 남는다(텔레그램 미설정 시 실제로 그랬다).
  const { data: negatives, error: negErr } = await supabase
    .from('reviews')
    .select('id, author_display, content, reply_draft')
    .eq('store_id', store.id)
    .eq('sentiment', 'negative')
    .is('owner_notified_at', null)
    .is('reply_sent_at', null)
    .order('posted_at', { ascending: false });
  if (!negErr && negatives) {
    base.pendingNegatives = negatives.map((n) => ({
      id: n.id as string,
      author: (n.author_display ?? null) as string | null,
      content: n.content as string,
      replyDraft: (n.reply_draft ?? null) as string | null,
    }));
  }

  return base;
}

/** 부정 리뷰 알림 발송 후 owner_notified_at 마킹 (중복 알림 방지) */
export async function markNegativesNotified(
  supabase: SupabaseClient,
  reviewIds: string[],
): Promise<void> {
  if (reviewIds.length === 0) return;
  await supabase
    .from('reviews')
    .update({ owner_notified_at: new Date().toISOString() })
    .in('id', reviewIds);
}
