import Link from 'next/link';
import { signOut } from '@/app/auth/actions';

/**
 * 사장님 화면 공용 헤더 — 로고(→설정) + nav + 로그아웃.
 * 이전엔 5개 화면에 같은 마크업이 복붙돼 있어 링크 하나 추가에 5곳을 고쳐야 했음.
 * 서버·클라이언트 어느 트리에서든 임포트 가능(훅 없음, signOut은 서버액션 레퍼런스).
 */
const NAV = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/posts', label: '글' },
  { href: '/reviews', label: '리뷰' },
  { href: '/regulars', label: '단골' },
  { href: '/channels', label: '채널' },
] as const;

const WIDTH = { '6xl': 'max-w-6xl', '4xl': 'max-w-4xl', '2xl': 'max-w-2xl' } as const;

export function AppHeader({
  storeName,
  current,
  width = '6xl',
}: {
  storeName: string;
  /** 현재 경로 — NAV에 있으면 그 항목이 밝게 표시됨. /settings처럼 NAV 밖 경로도 허용 */
  current: string;
  width?: keyof typeof WIDTH;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
      <div className={`mx-auto flex h-16 ${WIDTH[width]} items-center justify-between px-5 sm:px-6`}>
        <Link href="/settings" className="group flex items-center gap-3" title="매장 설정">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
          {/* 모바일(375px)에서 nav 6항목과 공존하도록 이름은 sm↑에서만 */}
          <span className="hidden text-[15px] font-semibold transition group-hover:text-[var(--color-amber)] sm:inline">{storeName}</span>
        </Link>
        <nav className="flex items-center gap-3.5 text-[13px] text-[var(--color-fg-2)] sm:gap-5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={current.startsWith(n.href) ? 'text-[var(--color-fg)]' : 'hover:text-[var(--color-fg)]'}
            >
              {n.label}
            </Link>
          ))}
          <form action={signOut}>
            <button type="submit" className="hover:text-[var(--color-fg)]">로그아웃</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
