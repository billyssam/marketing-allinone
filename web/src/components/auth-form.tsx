'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signInWithEmail, signUpWithEmail, signInWithProvider, signInWithNaver, type AuthState } from '@/app/auth/actions';

const PROVIDER_LABEL: Record<string, string> = { kakao: '카카오', google: '구글', naver: '네이버' };

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const action = mode === 'login' ? signInWithEmail : signUpWithEmail;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const params = useSearchParams();
  const socialSoon = params.get('notice') === 'social-soon';
  const soonLabel = PROVIDER_LABEL[params.get('p') ?? ''] ?? '소셜';

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
        <span className="text-[15px] font-semibold tracking-tight">마케팅올인원</span>
      </Link>

      <h1 className="h2">{mode === 'login' ? '다시 오셨네요.' : '5분이면 시작해요.'}</h1>
      <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">
        {mode === 'login' ? '사장님 계정으로 로그인하세요.' : '매장 하나로 모든 채널을 연결합니다.'}
      </p>

      {socialSoon && (
        <div className="mt-6 rounded-xl border border-[var(--color-hair-strong)] bg-[var(--color-panel-2)] p-3 text-[12.5px] text-[var(--color-fg-2)]">
          <b className="text-[var(--color-fg)]">{soonLabel} 로그인</b>은 곧 지원돼요. 지금은 <b className="text-[var(--color-amber)]">이메일</b>로 바로 시작하실 수 있어요.
        </div>
      )}

      {/* 소셜 로그인 — 카카오(1순위)·네이버·구글 */}
      <div className="mt-8 space-y-2.5">
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="kakao" />
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fee500] py-3 text-[14px] font-semibold text-[#3c1e1e] transition hover:brightness-95">
            <span className="font-black">K</span> 카카오로 {mode === 'login' ? '로그인' : '시작하기'}
          </button>
        </form>
        <div className="grid grid-cols-2 gap-2.5">
          <form action={signInWithNaver}>
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#03c75a] py-3 text-[13px] font-semibold text-white transition hover:brightness-95">
              <span className="font-black">N</span> 네이버
            </button>
          </form>
          <form action={signInWithProvider}>
            <input type="hidden" name="provider" value="google" />
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-hair-strong)] bg-white py-3 text-[13px] font-semibold text-[#1f1f1f] transition hover:brightness-95">
              <span className="font-black text-[#4285f4]">G</span> 구글
            </button>
          </form>
        </div>
      </div>

      <div className="my-5 flex items-center gap-3 text-[12px] text-[var(--color-fg-4)]">
        <span className="h-px flex-1 bg-[var(--color-hair)]" /> 또는 이메일 <span className="h-px flex-1 bg-[var(--color-hair)]" />
      </div>

      <form action={formAction} className="space-y-3">
        <input name="email" type="email" required placeholder="name@example.com" autoComplete="email"
          className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px] outline-none transition focus:border-[var(--color-amber)]" />
        <input name="password" type="password" required placeholder="비밀번호" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px] outline-none transition focus:border-[var(--color-amber)]" />

        {state.error && <p className="text-[13px] text-[var(--color-bad)]">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full rounded-xl py-3 text-[14px] font-semibold disabled:opacity-60">
          {pending ? '처리 중…' : mode === 'login' ? '로그인' : '무료로 시작하기'}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--color-fg-3)]">
        {mode === 'login' ? (
          <>계정이 없으신가요? <Link href="/signup" className="text-[var(--color-amber)] hover:underline">회원가입</Link></>
        ) : (
          <>이미 계정이 있으신가요? <Link href="/login" className="text-[var(--color-amber)] hover:underline">로그인</Link></>
        )}
      </p>
    </div>
  );
}
