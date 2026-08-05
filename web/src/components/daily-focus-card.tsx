import Link from 'next/link';
import type { DailyFocus } from '@shared/content-engine/daily-focus';

/**
 * 오늘의 우선순위 — "이거 하나만이라도" 카드.
 *
 * 채널을 여러 개 연결하면 붙여넣기가 8건까지 뜬다. 전부 같은 크기로 나열하면
 * 부담스러워서 아무것도 안 하게 되고, 그러면 매일 8건이 그대로 지나간다.
 * 하나를 크게 세우고 이유·소요시간을 붙여 "그 정도면 하지" 상태를 만든다.
 * 나머지는 숨기지 않고 접어둔다 — 다 하고 싶은 사장님을 막으면 안 된다.
 */
export function DailyFocusCard({ focus }: { focus: DailyFocus }) {
  const { primary, secondary, rest } = focus;
  if (!primary) return null;

  return (
    <div className="panel rounded-[var(--radius-lg)] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="eyebrow">오늘 하나만 한다면</span>
        <span className="mono text-[11px] text-[var(--color-fg-3)]">{primary.effort}</span>
      </div>

      <Link
        href={`/prepare?post=${primary.postId}`}
        className="mt-3 block rounded-[14px] border border-[var(--color-hair-strong)] bg-[var(--color-bg)] p-4 transition hover:border-[var(--color-fg-4)]"
      >
        <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: primary.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: primary.color }} />
          {primary.channelName}
        </span>
        <div className="mt-2 text-[15px] leading-snug tracking-tight text-[var(--color-fg)]">
          {primary.title || '오늘의 초안'}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-fg-2)]">{primary.reason}</p>
        <div
          className="mt-3.5 w-full rounded-lg py-2 text-center text-[13px] font-medium"
          style={{ background: `${primary.color}1c`, color: primary.color }}
        >
          붙여넣기 →
        </div>
      </Link>

      {secondary && (
        <Link
          href={`/prepare?post=${secondary.postId}`}
          className="mt-2 flex items-center justify-between gap-3 rounded-[12px] border border-[var(--color-hair)] px-3.5 py-3 transition hover:border-[var(--color-hair-strong)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: secondary.color }} />
            <span className="truncate text-[13px]">
              여유되면 <b className="font-medium" style={{ color: secondary.color }}>{secondary.channelName}</b>도
            </span>
          </span>
          <span className="mono shrink-0 text-[11px] text-[var(--color-fg-3)]">{secondary.effort}</span>
        </Link>
      )}

      {rest.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none rounded-[12px] px-3.5 py-2.5 text-[12.5px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg-2)]">
            나머지 {rest.length}건도 준비돼 있어요 <span className="group-open:hidden">▾</span>
            <span className="hidden group-open:inline">▴</span>
          </summary>
          <div className="mt-1 space-y-1.5">
            {rest.map((it) => (
              <Link
                key={it.postId}
                href={`/prepare?post=${it.postId}`}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--color-hair)] px-3.5 py-2.5 transition hover:border-[var(--color-hair-strong)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: it.color }} />
                  <span className="truncate text-[12.5px] text-[var(--color-fg-2)]">{it.channelName}</span>
                </span>
                <span className="mono shrink-0 text-[11px] text-[var(--color-fg-3)]">{it.effort}</span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
