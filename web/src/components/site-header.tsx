import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">
            ㅁ
          </span>
          <span className="text-[15px] font-semibold tracking-tight">마케팅올인원</span>
        </Link>
        <nav className="hidden items-center gap-8 text-[13px] text-[var(--color-fg-2)] md:flex">
          <Link href="#features" className="transition hover:text-[var(--color-fg)]">기능</Link>
          <Link href="#channels" className="transition hover:text-[var(--color-fg)]">채널</Link>
          <Link href="#dashboard" className="transition hover:text-[var(--color-fg)]">대시보드</Link>
          <Link href="#pricing" className="transition hover:text-[var(--color-fg)]">가격</Link>
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-[13px] text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)] sm:inline-block">
            로그인
          </Link>
          <Link href="/signup" className="rounded-full bg-[var(--color-fg)] px-4 py-2 text-[13px] font-medium text-[var(--color-bg)] transition hover:bg-white">
            시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
