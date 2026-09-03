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
  /**
   * 이 업종이 네이버 플레이스를 가질 수 있는가(`hasPlacePage(biz)`).
   * false면 리뷰가 **영영** 안 들어온다 — 온라인 셀러·프리랜서·과외.
   * 그런 사장님께 "플레이스 연결 후 집계"라고 쓰면 **영원히 오지 않을 것을 기다리라는 말**이고,
   * 넉 장뿐인 타일 한 칸을 죽은 지표가 차지한다(2026-09-03 실사용자 화면에서 실측).
   */
  canHavePlace: boolean;
  /** 이번 주에 글을 올린 날 수 — 리뷰를 못 쓰는 업종의 대체 지표 */
  weekPublishedDays: number;
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
    // 플레이스를 가질 수 있는 업종만 리뷰 지표를 본다.
    // 온라인 셀러에게는 대신 **실제로 답이 나오는 지표**(이번 주 올린 날)를 준다 —
    // 우리가 매일 글을 공급하니 성과도 날 단위로 세는 게 맞다.
    data.canHavePlace
      ? {
          label: '리뷰 긍정률',
          value: data.totalReviews > 0 ? String(data.posRate) : '—',
          unit: data.totalReviews > 0 ? '%' : '',
          sub: data.totalReviews > 0 ? `리뷰 ${data.totalReviews.toLocaleString()}건 기준` : '플레이스 연결 후 집계',
          accent: data.totalReviews > 0 && data.posRate >= 80 ? 'var(--color-good)' : undefined,
        }
      : {
          label: '이번 주 올린 날',
          value: String(data.weekPublishedDays),
          unit: '일',
          sub: data.weekPublishedDays > 0 ? '꾸준함이 제일 세요' : '한 번만 올려도 시작이에요',
          accent: data.weekPublishedDays === 0 ? 'var(--color-amber)' : undefined,
        },
    {
      // 초안 개수가 아니라 "오늘 올렸나(0/1) + 답글 대기". 끝낼 수 있는 숫자여야 한다.
      // ⚠️ 글이 아직 하나도 없는 매장(가입 1분차)에 "끝났어요"라고 하면 안 된다 —
      //    아무것도 안 했는데 다 했다고 하는 셈이다(2026-08-18 사장님 시뮬레이션에서 실측).
      label: '오늘 할 일',
      value: data.todo.toLocaleString(),
      unit: '건',
      sub:
        data.todo > 0
          ? '오늘 하나 + 답글'
          : data.totalPosts === 0
            ? '첫 글을 준비하고 있어요'
            : '오늘 몫은 끝났어요',
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
