import type { PlannedDay } from '@shared/content-engine/angles';

/**
 * 이번 주 콘텐츠 계획 — 각도 로테이션이 결정적이라 앞으로 나올 글을 미리 보여준다.
 * 사장님에게 "매일 다른 글이 예정돼 있다"는 투명성·안심. (서버 컴포넌트, 정적)
 */
const DAY_LABEL = ['오늘', '내일', '모레'];
function dayLabel(offset: number): string {
  return DAY_LABEL[offset] ?? `${offset}일 뒤`;
}

export function WeekPlan({ plan }: { plan: PlannedDay[] }) {
  if (!plan.length) return null;
  /**
   * 소재가 한 종류뿐이면 이름을 매일 반복해 보여주지 않는다.
   *
   * 실측(2026-08-18 사장님 시뮬레이션): 판매 항목을 하나만 적은 매장에서
   * "오늘 대표메뉴 · 소금빵 / 내일 계절 · 소금빵 / 모레 분위기 · 소금빵 …"이 떴다.
   * 각도는 진짜로 매일 다른데, **화면은 5일 내내 같은 얘기를 하는 것처럼 읽힌다.**
   * 반복해서 보여줘 봐야 새 정보가 없고, 사장님이 할 수 있는 일(항목 추가)을 알려주는 게 낫다.
   */
  const featuredKinds = new Set(plan.map((d) => d.featured).filter(Boolean));
  const oneSubject = featuredKinds.size <= 1;
  return (
    <div className="panel rounded-[var(--radius-lg)] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">이번 주 콘텐츠 계획</span>
        <span className="mono text-[10px] text-[var(--color-fg-3)]">매일 다른 각도로</span>
      </div>
      <ul className="divide-y divide-[var(--color-hair)]">
        {plan.map((d) => (
          <li key={d.dayOffset} className="flex items-center gap-3 py-2.5">
            <span className={`mono w-12 shrink-0 text-[11px] ${d.dayOffset === 0 ? 'font-medium text-[var(--color-amber)]' : 'text-[var(--color-fg-3)]'}`}>
              {dayLabel(d.dayOffset)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-fg-2)]">
              <span className="text-[var(--color-fg)]">{d.angleLabel}</span>
              {d.featured && !oneSubject && <span className="text-[var(--color-fg-3)]"> · {d.featured}</span>}
            </span>
            {d.occasion && (
              <span className="mono shrink-0 rounded-full bg-[var(--color-amber)]/12 px-2 py-0.5 text-[9px] text-[var(--color-amber)]">
                {d.occasion}
              </span>
            )}
          </li>
        ))}
      </ul>
      {oneSubject && featuredKinds.size === 1 && (
        <p className="mt-3 border-t border-[var(--color-hair)] pt-3 text-[12px] text-[var(--color-fg-3)]">
          지금은 <b className="text-[var(--color-fg-2)]">{[...featuredKinds][0]}</b> 하나로 씁니다.
          매장 설정에 몇 개만 더 적어두면 소재도 매일 달라져요.
        </p>
      )}
    </div>
  );
}
