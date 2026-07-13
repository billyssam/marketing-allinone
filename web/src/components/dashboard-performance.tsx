export interface PerfData {
  totalReviews: number;
  positive: number;
  neutral: number;
  negative: number;
  pendingReplies: number;
  totalPosts: number;
}

/**
 * 대시보드 성과 — 실데이터만. 없는 지표(도달·조회·전환)는 날조하지 않고 "집계 예정"으로 정직 표시.
 * (이전 DashboardPreview 하드코딩 목업 대체)
 */
export function DashboardPerformance({ data }: { data: PerfData }) {
  const { totalReviews, positive, neutral, negative, pendingReplies, totalPosts } = data;
  const posRate = totalReviews ? Math.round((positive / totalReviews) * 100) : 0;
  const pct = (n: number) => (totalReviews ? Math.round((n / totalReviews) * 100) : 0);

  const kpis: { label: string; value: number; unit: string; accent?: string }[] = [
    { label: '수집 리뷰', value: totalReviews, unit: '건' },
    { label: '긍정률', value: posRate, unit: '%', accent: totalReviews ? 'var(--color-good)' : undefined },
    { label: '답글 대기', value: pendingReplies, unit: '건', accent: pendingReplies > 0 ? 'var(--color-amber)' : undefined },
    { label: '생성한 초안', value: totalPosts, unit: '건' },
  ];

  return (
    <div className="panel rounded-[var(--radius-lg)] p-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[var(--radius)] bg-[var(--color-panel-2)] p-3.5">
            <div className="eyebrow">{k.label}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[26px] font-bold tabular-nums" style={{ color: k.accent ?? 'var(--color-fg)' }}>
                {k.value.toLocaleString()}
              </span>
              <span className="text-[12px] text-[var(--color-fg-3)]">{k.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {totalReviews > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">리뷰 감정 분포</span>
            <span className="mono text-[10px] text-[var(--color-fg-3)]">총 {totalReviews}건</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
            <div style={{ width: `${pct(positive)}%`, background: 'var(--color-good)' }} />
            <div style={{ width: `${pct(neutral)}%`, background: 'var(--color-fg-4)' }} />
            <div style={{ width: `${pct(negative)}%`, background: 'var(--color-bad)' }} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
            <span className="text-[var(--color-good)]">긍정 {positive} · {pct(positive)}%</span>
            <span className="text-[var(--color-fg-3)]">중립 {neutral} · {pct(neutral)}%</span>
            <span className="text-[var(--color-bad)]">부정 {negative} · {pct(negative)}%</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 border-t border-[var(--color-hair)] pt-3 text-[11px] text-[var(--color-fg-4)]">
        <span className="h-1 w-1 rounded-full bg-[var(--color-fg-4)]" />
        도달·조회·전환은 채널 연동 후 집계됩니다
      </div>
    </div>
  );
}
