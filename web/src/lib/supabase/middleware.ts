import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { safeAuthRedirect } from '@shared/auth-redirect';

/**
 * 사장님 전용(로그인 필수) 라우트. 새 사장님 페이지를 추가하면 여기 한 줄 넣을 것.
 * 각 페이지가 자체 getUser() 가드도 갖지만(방어심층), 프록시에서 먼저 막아야
 * 로그인 후 원래 페이지로 돌아오는 next= 흐름이 작동한다.
 * 초안 링크도 로그인과 소유권 확인을 거친다.
 */
const PROTECTED_ROUTES = ['/dashboard', '/onboarding', '/channels', '/reviews', '/regulars', '/settings', '/posts', '/report', '/prepare'];

/** 세션 자동 갱신 + 보호 라우트 가드 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // 키 미설정 시(개발 초기) 인증 건너뜀 — 랜딩 등 공개 페이지 접근 유지
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_ROUTES.some((p) => path.startsWith(p));
  const isAuthPage = path.startsWith('/login') || path.startsWith('/signup');

  if (isProtected && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.search = '';
    redirect.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(redirect);
  }
  if (isAuthPage && user) {
    const redirect = request.nextUrl.clone();
    const next = new URL(safeAuthRedirect(request.nextUrl.searchParams.get('next')), request.url);
    redirect.pathname = next.pathname;
    redirect.search = next.search;
    return NextResponse.redirect(redirect);
  }

  return response;
}
