import Link from 'next/link';

/** 법적 문서 공용 셸 — 공개 페이지(로그인 불필요), 본문 가독 최우선 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-semibold text-[var(--color-amber-ink)]">ㅁ</span>
            <span className="text-[15px] font-medium">마케팅올인원</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] text-[var(--color-fg-2)]">
            <Link href="/legal/terms" className="hover:text-[var(--color-fg)]">이용약관</Link>
            <Link href="/legal/privacy" className="hover:text-[var(--color-fg)]">개인정보처리방침</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-6">{children}</main>
    </div>
  );
}
