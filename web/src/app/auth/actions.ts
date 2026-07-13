'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export type AuthState = { error?: string };

const NOT_READY = '아직 인증이 연결되지 않았어요. (Supabase 설정 대기 중)';

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: NOT_READY };
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: '이메일과 비밀번호를 입력하세요' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error.message) };
  redirect('/dashboard');
}

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: NOT_READY };
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || password.length < 6) return { error: '비밀번호는 6자 이상이어야 합니다' };

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: translate(error.message) };
  // 확인메일 ON 프로젝트: 세션이 안 잡힘 → 온보딩으로 보내면 미들웨어가 튕김.
  // 세션 있으면(확인 OFF) 바로 온보딩, 없으면 "메일 확인" 안내.
  if (!data.session) redirect('/signup?notice=check-email');
  redirect('/onboarding');
}

/** 카카오·구글 — Supabase 네이티브 OAuth. 프로바이더 미설정 시 크래시/날JSON 대신 안내로 폴백 */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '') as 'kakao' | 'google';
  const notice = `/login?notice=social-soon&p=${provider}`;
  if (!isSupabaseConfigured || !['kakao', 'google'].includes(provider)) redirect(notice);

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    // 브라우저 자동 리다이렉트 끄고 url만 받아, 프로바이더가 켜졌는지 서버서 먼저 확인
    options: { redirectTo: `${origin}/auth/callback?next=/onboarding`, skipBrowserRedirect: true },
  });
  if (error || !data?.url) redirect(notice);

  // 미설정 프로바이더는 authorize가 400(Unsupported provider) → 사용자 보내기 전 프로브.
  // (redirect는 NEXT_REDIRECT를 throw하므로 try 밖에서 호출)
  let enabled = true;
  try {
    const probe = await fetch(data.url, { redirect: 'manual', signal: AbortSignal.timeout(3500) });
    enabled = probe.status < 400; // 켜짐=302(프로바이더로), 꺼짐=400
  } catch {
    /* 프로브 실패(네트워크·타임아웃)는 통과시켜 실제 플로우에 맡김 */
  }
  if (!enabled) redirect(notice);
  redirect(data.url);
}

/** 네이버 — Supabase 미지원 → 커스텀 OAuth. 키 없으면 안내로 폴백 */
export async function signInWithNaver(): Promise<void> {
  if (!process.env.NAVER_CLIENT_ID) redirect('/login?notice=social-soon&p=naver');
  redirect('/auth/naver/start');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (m.includes('already registered') || m.includes('already been registered')) return '이미 가입된 이메일입니다';
  if (m.includes('invalid') && m.includes('email')) return '이메일 형식이 올바르지 않습니다';
  if (m.includes('rate limit')) return '잠시 후 다시 시도해주세요';
  return '문제가 발생했습니다. 다시 시도해주세요';
}
