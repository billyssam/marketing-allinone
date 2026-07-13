export default function ReviewsLoading() {
  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 h-16 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80" />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-panel-2)]" />
        <div className="mt-3 h-8 w-56 max-w-full animate-pulse rounded-lg bg-[var(--color-panel-2)]" />

        <div className="mt-6 h-20 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-panel)]" />

        <div className="mt-6 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-[var(--color-panel-2)]" />
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-panel)]" />
          ))}
        </div>
      </main>
    </div>
  );
}
