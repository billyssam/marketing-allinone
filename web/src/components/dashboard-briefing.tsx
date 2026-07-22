import Link from 'next/link';

export interface BriefingItem {
  key: string;
  kind: 'post' | 'review';
  channelLabel: string;
  color: string;
  title: string;
  status: string;
  actionLabel: string;
  href: string;
}

/**
 * 대시보드 "오늘의 브리핑" — 실데이터.
 * 사장님이 오늘 처리할 것(발행 대기 초안 + 답글 대기 리뷰)을 카톡 브리핑 톤으로 요약.
 */
export function DashboardBriefing({ items }: { items: BriefingItem[] }) {
  if (items.length === 0) {
    return (
      <div className="panel rounded-[var(--radius-lg)] p-8 text-center">
        <p className="text-[14px] text-[var(--color-fg-2)]">
          오늘 처리할 항목이 없어요. <b>‘오늘 글 생성’</b>을 눌러 첫 초안을 만들어보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="panel rounded-[var(--radius-lg)] p-4">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="eyebrow">오늘 처리할 항목</span>
        <span className="mono text-[12px] text-[var(--color-fg)]">{items.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className="group rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-bg)] p-3 transition hover:border-[var(--color-hair-strong)]"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: it.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.color }} />
                {it.channelLabel}
              </span>
              <span className="mono text-[10px] text-[var(--color-fg-3)]">{it.status}</span>
            </div>
            <div className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--color-fg)]">{it.title}</div>
            <div
              className="mt-2.5 w-full rounded-lg py-1.5 text-center text-[12px] font-medium"
              style={{ background: `${it.color}1c`, color: it.color }}
            >
              {it.actionLabel}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
