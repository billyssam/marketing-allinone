'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 대시보드에서 오늘 글 초안을 생성 → posts 저장 → 목록 새로고침 */
export function GenerateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}), // 기본: 매장 블로그 1건
      });
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Gemini 무료 한도(20회/일)를 다 썼어요. 잠시 후 다시 시도하거나 결제를 연결해주세요.');
        }
        // 비-JSON 에러 바디(500 HTML·502/504 게이트웨이)에도 안전하게
        let message = '생성 실패';
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          /* 파싱 실패 시 기본 메시지 유지 */
        }
        throw new Error(message);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="btn-primary rounded-full px-5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
      >
        {loading ? '생성 중… (10~20초)' : '오늘 글 생성'}
      </button>
      {error && <p className="max-w-[260px] text-right text-[11.5px] text-[var(--color-danger,#e5484d)]">{error}</p>}
    </div>
  );
}
