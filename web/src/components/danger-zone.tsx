'use client';

import { useState, useTransition } from 'react';
import { deleteAccount } from '@/app/settings/actions';

/**
 * 계정 삭제(탈퇴) — 실수 방지 2단계: 펼치기 → '삭제' 입력 후 실행.
 * 매장·글·리뷰·단골 데이터가 즉시 파기됨을 명확히 고지.
 */
export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-12 rounded-[var(--radius-lg)] border border-[var(--color-bad)]/25 p-5">
      <h2 className="text-[15px] font-semibold text-[var(--color-bad)]">계정 삭제</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-fg-3)]">
        탈퇴하면 매장 정보·생성한 글·리뷰·단골 데이터가 <b className="text-[var(--color-fg-2)]">즉시 삭제</b>되며 되돌릴 수 없습니다.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full border border-[var(--color-bad)]/35 px-4 py-2 text-[13px] font-medium text-[var(--color-bad)] transition hover:bg-[var(--color-bad)]/10"
        >
          계정을 삭제할래요
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-[13px] text-[var(--color-fg-2)]">
            계속하려면 <b className="font-mono text-[var(--color-bad)]">삭제</b> 를 입력하세요
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="삭제"
            className="w-full max-w-[12rem] rounded-lg border border-[var(--color-hair-strong)] bg-[var(--color-panel)] px-3 py-2 text-[14px] outline-none focus:border-[var(--color-bad)]"
          />
          {error && <p className="text-[13px] text-[var(--color-bad)]">{error}</p>}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={confirm !== '삭제' || pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await deleteAccount({ confirm });
                  if (res?.error) setError(res.error);
                })
              }
              className="rounded-full bg-[var(--color-bad)] px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? '삭제 중…' : '영구 삭제'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirm(''); setError(null); }}
              className="rounded-full border border-[var(--color-hair-strong)] px-4 py-2 text-[13px] text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
