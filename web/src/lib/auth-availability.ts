import 'server-only';

export type LoginProvider = 'kakao' | 'google' | 'naver';

/** 인증 서비스가 켠 로그인만 노출한다. 조회 실패 시 소셜 진입은 숨긴다. */
export async function availableLoginProviders(): Promise<LoginProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ready: LoginProvider[] = [];
  if (url && key) {
    try {
      const response = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key }, signal: AbortSignal.timeout(3000), cache: 'no-store',
      });
      if (response.ok) {
        const settings = await response.json();
        for (const provider of ['kakao', 'google'] as const) {
          if (settings.external?.[provider] === true) ready.push(provider);
        }
      }
    } catch { /* 이메일 로그인 경로는 유지한다. */ }
  }
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) ready.push('naver');
  return ready;
}
