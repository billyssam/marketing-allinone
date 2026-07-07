import { NextResponse, type NextRequest } from 'next/server';

/** 네이버 OAuth 시작 — authorize로 리다이렉트 (state는 CSRF 방지 쿠키) */
export async function GET(request: NextRequest) {
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL('/login?error=naver_not_ready', request.url));
  }
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const redirectUri = `${origin}/auth/naver/callback`;

  const authorize = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set('naver_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return res;
}
