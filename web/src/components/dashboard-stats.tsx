/**
 * 대시보드 히어로 KPI 스트립 — 업종에 맞춰 적응하는 4개 지표 타일.
 * (Linear/Vercel 톤: 헤어라인 타일 · uppercase 마이크로라벨 · tabular-nums · 상태색은 액션에만)
 * 서버 컴포넌트(정적 표시, 상호작용 없음).
 */
export interface StatStripData {
  /** 판매 항목 — 업종별 명사(메뉴/상품/시술/프로그램)와 개수 */
  offeringNoun: string;
  offeringCount: number;
  totalPosts: number;
  weekPosts: number;
  totalReviews: number;
  posRate: number;
  /** 오늘 할 일(붙여넣기·답글 대기 합) */
  todo: number;
}

export function DashboardStats({ data }: { data: StatStripData }) {
  const tiles: {
    label: string;
    value: string;
    unit?: string;
    sub: string;
    accent?: string;
    dot?: string;
  }[] = [
    {
      label: data.offeringNoun,
      value: data.offeringCount.toLocaleString(),
      unit: '개',
      sub: data.offeringCount > 0 ? '글에 그대로 반영돼요' : '추가하면 글이 구체적으로',
      accent: data.offeringCount === 0 ? 'var(--color-amber)' : undefined,
    },
    {
      label: '생성한 글',
      value: data.totalPosts.toLocaleString(),
      unit: '건',
      sub: data.weekPosts > 0 ? `이번 주 ${data.weekPosts}건` : '오늘 첫 글을 만들어요',
    },
    {
      label: '리뷰 긍정률',
      value: data.totalReviews > 0 ? String(data.posRate) : '—',
      unit: data.totalReviews > 0 ? '%' : '',
      sub: data.totalReviews > 0 ? `리뷰 ${data.totalReviews.toLocaleString()}건 기준` : '플레이스 연결 후 집계',
      accent: data.totalReviews > 0 && data.posRate >= 80 ? 'var(--color-good)' : undefined,
    },
    {
      // 초안 개수가 아니라 "오늘 올렸나(0/1) + 답글 대기". 끝낼 수 있는 숫자여야 한다
      label: '오늘 할 일',
      value: data.todo.toLocaleString(),
      unit: '건',
      sub: data.todo > 0 ? '오늘 하나 + 답글' : '오늘 몫은 끝났어요',
      accent: data.todo > 0 ? 'var(--color-amber)' : 'var(--color-good)',
      dot: data.todo > 0 ? 'var(--color-amber)' : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="panel min-w-0 rounded-[var(--radius)] p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{t.label}</span>
            {t.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />}
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: t.accent ?? 'var(--color-fg)' }}>
              {t.value}
            </span>
            {t.unit && <span className="text-[13px] text-[var(--color-fg-3)]">{t.unit}</span>}
          </div>
          <p className="mt-2 truncate text-[11.5px] text-[var(--color-fg-3)]">{t.sub}</p>
        </div>
      ))}
    </div>
  );
}
