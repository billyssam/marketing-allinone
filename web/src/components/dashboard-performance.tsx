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
  /** hover 툴팁용 전체 표기 (예: "월요일 · 3건") */
  full?: string;
}

export interface FeedItem {
  when: string; // "방금" | "N분 전" 등
  text: string;
  color: string;
}

/**
 * 대시보드 성과 — 리뷰 감정(diverging) + 주간 생성(magnitude) + 활동 피드.
 * 헤드라인 KPI는 상단 DashboardStats 스트립으로 이동. 여기는 시각화에 집중.
 * dataviz 원칙: 감정=diverging(good·gray·bad) 2px 갭 · 막대=라운드 데이터엔드+per-mark hover
 * · 범례는 스와치+텍스트토큰(색상 텍스트 금지) · 상태색은 예약.
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
  const { totalReviews, positive, neutral, negative } = data;
  const weekMax = Math.max(1, ...weekly.map((w) => w.count));
  const weekTotal = weekly.reduce((s, w) => s + w.count, 0);
  const pct = (n: number) => (totalReviews ? Math.round((n / totalReviews) * 100) : 0);

  const sentiments = [
    { key: 'pos', label: '긍정', n: positive, color: 'var(--color-good)' },
    { key: 'neu', label: '중립', n: neutral, color: 'var(--color-fg-4)' },
    { key: 'neg', label: '부정', n: negative, color: 'var(--color-bad)' },
  ];

  return (
    <div className="panel rounded-[var(--radius-lg)] p-4 sm:p-5">
      {/* 리뷰 감정 분포 — diverging 스택, 세그먼트 사이 2px 표면 갭 */}
      {totalReviews > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">리뷰 감정 분포</span>
            <span className="mono text-[10px] text-[var(--color-fg-3)]">총 {totalReviews.toLocaleString()}건</span>
          </div>
          <div className="flex h-2.5 gap-0.5">
            {sentiments.map((s) =>
              s.n > 0 ? (
                <div
                  key={s.key}
                  className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${pct(s.n)}%`, background: s.color }}
                  title={`${s.label} ${s.n}건 · ${pct(s.n)}%`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--color-fg-2)]">
            {sentiments.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: s.color }} />
                {s.label} <span className="tabular-nums text-[var(--color-fg-3)]">{s.n} · {pct(s.n)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 주간 생성 차트 + 활동 피드 */}
      <div className={`grid gap-4 sm:grid-cols-2 ${totalReviews > 0 ? 'mt-5 border-t border-[var(--color-hair)] pt-5' : ''}`}>
        <div className="min-w-0">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="eyebrow">최근 7일 생성</span>
            <span className="mono text-[10px] text-[var(--color-fg-3)]">{weekTotal}건</span>
          </div>
          <div className="flex items-end gap-1.5">
            {weekly.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5" title={w.full ?? `${w.label} · ${w.count}건`}>
                <span className={`mono text-[9px] tabular-nums ${w.count > 0 ? 'text-[var(--color-fg-3)]' : 'text-transparent'}`}>{w.count || 0}</span>
                <div
                  className="w-full rounded-t-[4px] transition-[height] duration-500"
                  style={{
                    height: `${w.count > 0 ? Math.max(6, Math.round((w.count / weekMax) * 64)) : 2}px`,
                    background: w.isToday ? 'var(--color-amber)' : w.count > 0 ? 'var(--color-hair-strong)' : 'var(--color-panel-2)',
                  }}
                />
                <span className={`text-[9.5px] ${w.isToday ? 'font-medium text-[var(--color-amber)]' : 'text-[var(--color-fg-4)]'}`}>{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="eyebrow">최근 활동</span>
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--color-good)] text-[var(--color-good)]" />
          </div>
          {feed.length === 0 ? (
            <p className="text-[12px] text-[var(--color-fg-3)]">아직 활동이 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {feed.map((f, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12px]">
                  <span className="mono w-12 shrink-0 text-[10px] tabular-nums text-[var(--color-fg-4)]">{f.when}</span>
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[1px] rounded-full" style={{ background: f.color }} />
                  {/* min-w-0 필수: truncate(nowrap)+flex min-width:auto가 그리드째 뷰포트를 뚫음 */}
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
