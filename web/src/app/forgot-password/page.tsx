'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from '@/app/auth/actions';

/**
 * 비밀번호 찾기 — 소셜 로그인이 켜지기 전까지 이메일이 유일한 진입 경로라
 * 이 화면이 없으면 비밀번호를 잊은 사장님은 서비스에 다시 들어올 방법이 없다.
 */
export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-amber)] font-mono text-[14px] font-semibold text-[var(--color-amber-ink)]">
            ㅁ
          </span>
          <span className="text-[15px] font-medium">마케팅올인원</span>
        </Link>

        <h1 className="h2 mt-8">비밀번호를 잊으셨나요?</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
          가입하신 이메일을 적어주시면 재설정 링크를 보내드려요.
        </p>

        <form action={action} className="mt-7 space-y-3">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@example.com"
            aria-label="가입한 이메일"
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px] outline-none focus:border-[var(--color-amber)]"
          />

          {state.error && <p className="text-[13px] text-[var(--color-bad)]">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full rounded-xl py-3 text-[14px] font-medium disabled:opacity-60"
          >
            {pending ? '보내는 중…' : '재설정 링크 받기'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-[var(--color-fg-3)]">
          <Link href="/login" className="text-[var(--color-amber)] hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </main>
  );
}
