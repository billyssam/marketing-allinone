import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * 네이버 OAuth 콜백 (Supabase 미지원 → 커스텀).
 * 1) code → 네이버 access token
 * 2) token → 네이버 프로필(email)
 * 3) admin으로 Supabase 유저 find/create (email 기준)
 * 4) admin.generateLink(magiclink) → verifyOtp로 서버 세션 수립
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = request.cookies.get('naver_oauth_state')?.value;
  const origin = url.origin;

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!isSupabaseConfigured || !clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/login?error=naver_not_ready`);
  }
  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${origin}/login?error=naver_state`);
  }

  try {
    // 1) code → token
    const tokenRes = await fetch(
      `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}`,
    );
    const token = await tokenRes.json();
    if (!token.access_token) throw new Error('네이버 토큰 발급 실패');

    // 2) token → 프로필
    const profRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const prof = await profRes.json();
    const email: string | undefined = prof?.response?.email;
    const nid: string = prof?.response?.id;
    if (!email) throw new Error('네이버 이메일 제공 동의 필요');

    // 3) find or create Supabase user
    const admin = createServiceClient();
    let userId: string | undefined;
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find((u: { email?: string }) => u.email === email);
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { provider: 'naver', naver_id: nid, name: prof.response?.name },
      });
      if (error) throw error;
      userId = created.user?.id;
    }
    if (!userId) throw new Error('유저 생성 실패');

    // 4) magiclink 생성 → verifyOtp로 세션 수립
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkErr || !link?.properties?.hashed_token) throw linkErr ?? new Error('링크 생성 실패');

    const supabase = await createClient();
    const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
    if (otpErr) throw otpErr;

    const res = NextResponse.redirect(`${origin}/onboarding`);
    res.cookies.delete('naver_oauth_state');
    return res;
  } catch (e) {
    console.error('[naver oauth]', e);
    return NextResponse.redirect(`${origin}/login?error=naver_failed`);
  }
}
