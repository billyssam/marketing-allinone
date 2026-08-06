import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth·이메일 링크 콜백.
 *
 * 두 가지 형태가 들어온다:
 *  - PKCE: `?code=...` → 서버에서 세션으로 교환(OAuth).
 *  - Implicit: `#access_token=...` → **초대·비밀번호 재설정 메일 링크가 이 형태다.**
 *    해시는 브라우저에만 남고 서버로 전송되지 않으므로 여기서는 보이지 않는다.
 *    예전엔 code가 없으면 무조건 `/login?error=auth`로 튕겼고, 그래서
 *    **초대 링크를 누른 사장님이 로그인 화면으로 떨어졌다**(파일럿 리허설에서 실측).
 *    → 해시를 읽을 수 있는 클라이언트 화면으로 넘긴다(리다이렉트해도 해시는 보존된다).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
  // code가 없다 = 해시 토큰일 가능성 → 클라이언트가 처리하게 넘긴다
  return NextResponse.redirect(`${origin}/auth/finish?next=${encodeURIComponent(next)}`);
}
