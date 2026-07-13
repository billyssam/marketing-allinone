import Link from 'next/link';

export const metadata = { title: '페이지를 찾을 수 없어요' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="eyebrow">error 404</div>
      <h1 className="h1 mt-4">페이지를 찾을 수 없어요</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
        주소가 바뀌었거나 삭제된 페이지일 수 있어요.
      </p>
      <div className="mt-8 flex gap-2.5">
        <Link href="/dashboard" className="btn-primary rounded-full px-5 py-2.5 text-[13px] font-semibold">대시보드로</Link>
        <Link href="/" className="rounded-full border border-[var(--color-hair-strong)] px-5 py-2.5 text-[13px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]">홈으로</Link>
      </div>
    </main>
  );
}
