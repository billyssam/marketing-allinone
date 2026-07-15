export interface PerfData {
  totalReviews: number;
  positive: number;
  neutral: number;
  negative: number;
  pendingReplies: number;
  totalPosts: number;
}

export interface WeeklyBar {
  /** 요일 라벨 (월~일) */
  label: string;
  count: number;
  isToday: boolean;
}

export interface FeedItem {
  when: string; // "방금" | "N분 전" 등
  text: string;
  color: string;
}

/**
 * 대시보드 성과 — 실데이터만. 없는 지표(도달·조회·전환)는 날조하지 않고 "집계 예정"으로 정직 표시.
 * (이전 DashboardPreview 하드코딩 목업 대체)
 */
export function DashboardPerformance({
  data,
  weekly = [],
  feed = [],
}: {
  data: PerfData;
  weekly?: WeeklyBar[];
  feed?: FeedItem[];
}) {
  const { totalReviews, positive, neutral, negative, pendingReplies, totalPosts } = data;
  const weekMax = Math.max(1, ...weekly.map((w) => w.count));
  const weekTotal = weekly.reduce((s, w) => s + w.count, 0);
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

      {/* 주간 생성 차트 + 활동 피드 (실데이터) */}
      {/* 그리드 아이템에 min-w-0: 내용 min-content가 트랙을 밀어내는 블로우아웃 방지 */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">최근 7일 초안 생성</span>
            <span className="mono text-[10px] text-[var(--color-fg-3)]">{weekTotal}건</span>
          </div>
          <div className="flex h-20 items-end gap-1.5">
            {weekly.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="mono text-[9px] tabular-nums text-[var(--color-fg-4)]">{w.count > 0 ? w.count : ''}</span>
                <div
                  className="w-full rounded-sm transition-all"
                  style={{
                    height: `${Math.max(3, Math.round((w.count / weekMax) * 52))}px`,
                    background: w.isToday ? 'var(--color-amber)' : w.count > 0 ? 'var(--color-hair-strong)' : 'var(--color-panel-2)',
                  }}
                />
                <span className={`text-[9.5px] ${w.isToday ? 'text-[var(--color-amber)]' : 'text-[var(--color-fg-4)]'}`}>{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="eyebrow">최근 활동</span>
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--color-good)] text-[var(--color-good)]" />
          </div>
          {feed.length === 0 ? (
            <p className="text-[12px] text-[var(--color-fg-3)]">아직 활동이 없어요.</p>
          ) : (
            <ul className="space-y-1.5">
              {feed.map((f, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12px]">
                  <span className="mono w-14 shrink-0 text-[10px] text-[var(--color-fg-4)]">{f.when}</span>
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[1px] rounded-full" style={{ background: f.color }} />
                  {/* min-w-0 필수: truncate(nowrap)는 flex 아이템의 min-width:auto와 만나면
                      한 줄 전체 폭이 최소폭이 돼 그리드째 뷰포트를 뚫음(375px에서 503px 실측) */}
                  <span className="min-w-0 flex-1 truncate text-[var(--color-fg-2)]">{f.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 border-t border-[var(--color-hair)] pt-3 text-[11px] text-[var(--color-fg-4)]">
        <span className="h-1 w-1 rounded-full bg-[var(--color-fg-4)]" />
        도달·조회·전환은 채널 연동 후 집계됩니다
      </div>
    </div>
  );
}
