'use client';

import { useMemo, useState, useTransition } from 'react';
import { markReplySent, unmarkReplySent } from '@/app/reviews/actions';

export interface ReviewRow {
  id: string;
  author: string | null;
  content: string;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  score: number | null;
  replyDraft: string | null;
  postedAt: string | null;
  replySentAt: string | null;
}

const SENTIMENT: Record<string, { label: string; color: string; dot: string }> = {
  positive: { label: '긍정', color: 'var(--color-good)', dot: 'var(--color-good)' },
  neutral: { label: '중립', color: 'var(--color-fg-3)', dot: 'var(--color-fg-3)' },
  negative: { label: '부정', color: 'var(--color-bad)', dot: 'var(--color-bad)' },
};

type Filter = 'all' | 'pending' | 'negative';

export function ReviewList({ reviews, placeId }: { reviews: ReviewRow[]; placeId: string | null }) {
  const [filter, setFilter] = useState<Filter>('pending');

  const counts = useMemo(
    () => ({
      all: reviews.length,
      pending: reviews.filter((r) => !r.replySentAt && r.replyDraft).length,
      negative: reviews.filter((r) => r.sentiment === 'negative').length,
    }),
    [reviews],
  );

  const shown = useMemo(() => {
    const list =
      filter === 'pending'
        ? reviews.filter((r) => !r.replySentAt && r.replyDraft)
        : filter === 'negative'
          ? reviews.filter((r) => r.sentiment === 'negative')
          : reviews;
    // 부정 → 답글대기 → 최신 순 (사장님이 급한 것부터)
    return [...list].sort((a, b) => {
      const sev = (r: ReviewRow) => (r.sentiment === 'negative' ? 0 : r.replySentAt ? 2 : 1);
      if (sev(a) !== sev(b)) return sev(a) - sev(b);
      return (b.postedAt ?? '').localeCompare(a.postedAt ?? '');
    });
  }, [reviews, filter]);

  const TABS: { key: Filter; label: string; n: number }[] = [
    { key: 'pending', label: '답글 대기', n: counts.pending },
    { key: 'negative', label: '부정', n: counts.negative },
    { key: 'all', label: '전체', n: counts.all },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition ${
              filter === t.key
                ? 'bg-[var(--color-fg)] text-[var(--color-bg)]'
                : 'border border-[var(--color-hair)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'
            }`}
          >
            {t.label} <span className="mono opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <p className="text-[14px] text-[var(--color-fg-2)]">
            {filter === 'pending'
              ? '답글 대기 중인 리뷰가 없습니다. 모두 처리되었어요.'
              : filter === 'negative'
                ? '부정 리뷰가 없습니다. 좋은 신호예요.'
                : '아직 수집된 리뷰가 없습니다. 리뷰는 매일 자동으로 수집됩니다.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((r) => (
            <ReviewCard key={r.id} review={r} placeId={placeId} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, placeId }: { review: ReviewRow; placeId: string | null }) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(!!review.replySentAt);
  const [pending, startTransition] = useTransition();
  const s = SENTIMENT[review.sentiment ?? 'neutral'];

  async function copyReply() {
    if (!review.replyDraft) return;
    try {
      await navigator.clipboard.writeText(review.replyDraft);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = review.replyDraft;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function toggleSent() {
    const next = !sent;
    setSent(next); // 낙관적
    startTransition(async () => {
      const res = next ? await markReplySent(review.id) : await unmarkReplySent(review.id);
      if (res.error) setSent(!next); // 롤백
    });
  }

  const replyUrl = 'https://new.smartplace.naver.com/'; // 스마트플레이스 리뷰 관리

  return (
    <div
      className="panel rounded-[var(--radius-lg)] p-4"
      style={{ borderColor: review.sentiment === 'negative' && !sent ? 'var(--color-bad)' : undefined }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${s.color}1c`, color: s.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
          <span className="text-[13px] font-medium text-[var(--color-fg)]">{review.author ?? '익명'}</span>
          {review.postedAt && (
            <span className="mono text-[10.5px] text-[var(--color-fg-3)]">{review.postedAt.slice(0, 10)}</span>
          )}
        </div>
        {sent ? (
          <span className="mono text-[10.5px] text-[var(--color-good)]">✓ 답글 완료</span>
        ) : (
          <span className="mono text-[10.5px] text-[var(--color-fg-3)]">답글 대기</span>
        )}
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--color-fg)]">{review.content}</p>

      {review.replyDraft && (
        <div className="mt-3 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-panel-2)] p-3.5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>AI 답글 초안</span>
            <span className="h-px flex-1 bg-[var(--color-hair)]" />
            <span className="text-[10px] text-[var(--color-fg-4)]">확인 후 붙여넣기</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--color-fg-2)]">{review.replyDraft}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {review.replyDraft && (
          <button
            type="button"
            onClick={copyReply}
            className="rounded-lg bg-[var(--color-amber)] px-3.5 py-2 text-[12px] font-medium text-[var(--color-amber-ink)] transition hover:opacity-90"
          >
            {copied ? '✓ 복사됨' : '답글 복사'}
          </button>
        )}
        {/* 주 동선: 복사 + 이동을 한 탭에 — 사장님 2탭→1탭 (제스처 안에서 복사라 안전) */}
        <a
          href={replyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { if (review.replyDraft) void copyReply(); }}
          className="rounded-lg border border-[var(--color-hair-strong)] px-3.5 py-2 text-[12px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
        >
          {review.replyDraft ? '복사하고 네이버에서 답글 ↗' : '네이버에서 답글 달기 ↗'}
        </a>
        <button
          type="button"
          onClick={toggleSent}
          disabled={pending}
          className={`rounded-lg px-3.5 py-2 text-[12px] font-medium transition disabled:opacity-50 ${
            sent
              ? 'border border-[var(--color-hair)] text-[var(--color-fg-3)]'
              : 'border border-[var(--color-good)] text-[var(--color-good)]'
          }`}
        >
          {sent ? '완료 취소' : '발송 완료 체크'}
        </button>
        {placeId && <span className="mono ml-auto text-[10px] text-[var(--color-fg-4)]">place {placeId}</span>}
      </div>
    </div>
  );
}
