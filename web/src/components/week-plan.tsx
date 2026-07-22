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
              {d.featured && <span className="text-[var(--color-fg-3)]"> · {d.featured}</span>}
            </span>
            {d.occasion && (
              <span className="mono shrink-0 rounded-full bg-[var(--color-amber)]/12 px-2 py-0.5 text-[9px] text-[var(--color-amber)]">
                {d.occasion}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
