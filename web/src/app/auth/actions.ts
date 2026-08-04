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

/**
 * 비밀번호 재설정 메일 발송.
 * 소셜 로그인이 아직 꺼져 있어 이메일이 유일한 진입 경로 → 비밀번호를 잊으면
 * 사장님이 영영 못 들어온다(파일럿에서 반드시 발생하는 상황).
 * 계정 존재 여부는 알려주지 않는다(계정 유무 탐색 방지) — 항상 같은 안내.
 */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: NOT_READY };
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: '이메일을 입력하세요' };

  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;
  const supabase = await createClient();
  // 실패해도 사용자에겐 동일 안내(존재하지 않는 계정을 구분해주지 않기 위해)
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  redirect('/login?notice=reset-sent');
}

/** 메일 링크로 들어온 세션에서 새 비밀번호 저장 */
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: NOT_READY };
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < 6) return { error: '비밀번호는 6자 이상이어야 합니다' };
  if (password !== confirm) return { error: '두 비밀번호가 서로 달라요' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 메일 링크 세션이 없으면(만료·직접 접근) 재요청으로 유도
  if (!user) return { error: '재설정 링크가 만료됐어요. 메일을 다시 요청해주세요.' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: translate(error.message) };
  redirect('/dashboard');
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
