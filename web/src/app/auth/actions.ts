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
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: translate(error.message) };
  redirect('/onboarding');
}

/** 카카오·구글 — Supabase 네이티브 OAuth */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '') as 'kakao' | 'google';
  if (!isSupabaseConfigured || !['kakao', 'google'].includes(provider)) return;
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) throw error;
  if (data.url) redirect(data.url);
}

/** 네이버 — Supabase 미지원 → 커스텀 OAuth 시작 (/auth/naver/start로 위임) */
export async function signInWithNaver(): Promise<void> {
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
  if (m.includes('already registered')) return '이미 가입된 이메일입니다';
  if (m.includes('rate limit')) return '잠시 후 다시 시도해주세요';
  return '문제가 발생했습니다. 다시 시도해주세요';
}
