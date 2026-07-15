import { POST_CHANNEL_LABEL, type PostChannel } from '@/lib/posts';
import type { WeeklyBar, FeedItem } from '@/components/dashboard-performance';

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function relTime(iso: string, nowMs: number): string {
  const diff = nowMs - Date.parse(iso);
  if (diff < 60_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / DAY)}일 전`;
}

/** KST 기준 최근 7일(오늘 포함) 초안 생성 수 막대 */
export function buildWeekly(createdAts: string[], nowMs: number): WeeklyBar[] {
  const todayIdx = Math.floor((nowMs + KST) / DAY);
  const counts = new Map<number, number>();
  for (const iso of createdAts) {
    const idx = Math.floor((Date.parse(iso) + KST) / DAY);
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  const out: WeeklyBar[] = [];
  for (let i = 6; i >= 0; i--) {
    const idx = todayIdx - i;
    const weekday = new Date(idx * DAY).getUTCDay(); // idx*DAY = 해당 KST 자정의 (UTC+9 보정된) 시각
    out.push({ label: WEEKDAY[weekday], count: counts.get(idx) ?? 0, isToday: i === 0 });
  }
  return out;
}

export interface PostForFeed {
  created_at: string;
  published_at?: string | null;
  channel: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
}
export interface ReviewForFeed {
  crawled_at?: string | null;
  reply_sent_at?: string | null;
  sentiment?: string | null;
}

/** 실데이터 활동 피드 — 초안 생성/발행 + 리뷰 수집(배치 묶음)/답글 완료 */
export function buildFeed(posts: PostForFeed[], reviews: ReviewForFeed[], nowMs: number, limit = 8): FeedItem[] {
  const events: { at: number; text: string; color: string }[] = [];

  for (const p of posts) {
    const label = POST_CHANNEL_LABEL[p.channel as PostChannel] ?? p.channel;
    const auto = (p.metadata as { auto?: string } | null)?.auto === 'daily';
    const title = (p.title ?? '').trim();
    events.push({
      at: Date.parse(p.created_at),
      text: `${label} 초안 ${auto ? '자동 ' : ''}생성${title ? ` · ${title}` : ''}`,
      color: 'var(--color-amber)',
    });
    if (p.published_at) {
      events.push({
        at: Date.parse(p.published_at),
        text: `${label} 발행 완료${title ? ` · ${title}` : ''}`,
        color: 'var(--color-good)',
      });
    }
  }

  // 리뷰 수집은 같은 크롤 배치(분 단위)로 묶어 "리뷰 N건 수집"
  const crawlBatch = new Map<string, { at: number; n: number; neg: number }>();
  for (const r of reviews) {
    if (r.crawled_at) {
      const key = r.crawled_at.slice(0, 16); // 분 단위
      const b = crawlBatch.get(key) ?? { at: Date.parse(r.crawled_at), n: 0, neg: 0 };
      b.n += 1;
      if (r.sentiment === 'negative') b.neg += 1;
      crawlBatch.set(key, b);
    }
    if (r.reply_sent_at) {
      events.push({ at: Date.parse(r.reply_sent_at), text: '리뷰 답글 완료', color: 'var(--color-good)' });
    }
  }
  for (const b of crawlBatch.values()) {
    events.push({
      at: b.at,
      text: `리뷰 ${b.n}건 수집${b.neg ? ` · 부정 ${b.neg}건` : ''}`,
      color: b.neg ? 'var(--color-bad)' : 'var(--color-review)',
    });
  }

  return events
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((e) => ({ when: relTime(new Date(e.at).toISOString(), nowMs), text: e.text, color: e.color }));
}
