'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="eyebrow" style={{ color: 'var(--color-bad)' }}>error</div>
      <h1 className="h1 mt-4">잠시 문제가 생겼어요</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
        일시적인 오류일 수 있어요. 다시 시도해보고, 계속되면 잠시 후 열어주세요.
      </p>
      {error?.digest && (
        <p className="mono mt-3 text-[10px] text-[var(--color-fg-4)]">ref: {error.digest}</p>
      )}
      <div className="mt-8 flex gap-2.5">
        <button onClick={reset} className="btn-primary rounded-full px-5 py-2.5 text-[13px] font-semibold">다시 시도</button>
        <a href="/dashboard" className="rounded-full border border-[var(--color-hair-strong)] px-5 py-2.5 text-[13px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]">대시보드로</a>
      </div>
    </main>
  );
}
