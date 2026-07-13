export default function DashboardLoading() {
  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 h-16 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80" />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="h-3 w-20 animate-pulse rounded bg-[var(--color-panel-2)]" />
        <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded-lg bg-[var(--color-panel-2)]" />

        <div className="mt-8 grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-panel)]" />
          ))}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[var(--radius)] bg-[var(--color-panel)]" />
          ))}
        </div>

        <div className="mt-10 h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-panel)]" />
      </main>
    </div>
  );
}
