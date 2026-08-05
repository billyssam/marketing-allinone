'use client';

import { useState } from 'react';

/** 주간 리포트 평문 복사 — 사장님이 카톡·메모로 옮기거나 직원과 공유할 때 */
export function CopyReportButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 권한이 없어도 화면은 그대로 읽을 수 있으니 조용히 넘어간다 */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-full border border-[var(--color-hair-strong)] bg-[var(--color-panel)] px-4 py-2 text-[13px] font-medium transition hover:border-[var(--color-fg-4)]"
    >
      {copied ? '복사됐어요' : '요약 복사'}
    </button>
  );
}
