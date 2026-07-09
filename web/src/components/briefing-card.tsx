const items = [
  { ch: '블로그', color: 'var(--color-naver)', title: '옥천 안내면 쿵더쿵 카페, 대청호 나들이길 쉼터', status: '초안 준비됨', action: '보내기' },
  { ch: '인스타', color: 'var(--color-ig)', title: '수제대추차 한 잔의 여유 · 릴스 15초', status: '오늘 18:00 예약', action: '예약됨' },
  { ch: '리뷰', color: 'var(--color-review)', title: '"음료가 미지근했어요" · 별점 ★★☆', status: '답글 초안 대기', action: '확인' },
];

export function BriefingCard() {
  return (
    <div className="panel w-full max-w-[380px] rounded-[18px] p-1.5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
      {/* kakao-style header */}
      <div className="flex items-center gap-2.5 rounded-t-[13px] bg-[var(--color-panel-2)] px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-amber)] text-[15px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">마케팅올인원</div>
          <div className="mono text-[10px] text-[var(--color-fg-3)]">오늘 오전 9:00 · 화요일 브리핑</div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-3">
        <div className="mb-2.5 px-1 text-[13px] text-[var(--color-fg-2)]">
          사장님, 오늘 준비된 <span className="font-semibold text-[var(--color-fg)]">3건</span>이에요.
        </div>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.ch} className="rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-bg)] p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: it.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.color }} />
                  {it.ch}
                </span>
                <span className="mono text-[10px] text-[var(--color-fg-3)]">{it.status}</span>
              </div>
              <div className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--color-fg)]">{it.title}</div>
              <button
                type="button"
                className="mt-2.5 w-full rounded-lg py-1.5 text-[12px] font-semibold"
                style={{ background: `${it.color}1c`, color: it.color }}
              >
                {it.action}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
