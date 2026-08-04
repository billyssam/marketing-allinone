'use client';

import { useActionState } from 'react';
import { updatePassword } from '@/app/auth/actions';

/** 메일 링크(/auth/callback?next=/reset-password)로 들어와 새 비밀번호를 정하는 화면 */
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, {});

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-amber)] font-mono text-[14px] font-semibold text-[var(--color-amber-ink)]">
          ㅁ
        </span>

        <h1 className="h2 mt-8">새 비밀번호를 정해주세요</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
          6자 이상이면 됩니다. 저장하면 바로 대시보드로 들어가요.
        </p>

        <form action={action} className="mt-7 space-y-3">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="새 비밀번호"
            aria-label="새 비밀번호"
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px] outline-none focus:border-[var(--color-amber)]"
          />
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="새 비밀번호 확인"
            aria-label="새 비밀번호 확인"
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px] outline-none focus:border-[var(--color-amber)]"
          />

          {state.error && <p className="text-[13px] leading-relaxed text-[var(--color-bad)]">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full rounded-xl py-3 text-[14px] font-medium disabled:opacity-60"
          >
            {pending ? '저장 중…' : '비밀번호 저장'}
          </button>
        </form>
      </div>
    </main>
  );
}
