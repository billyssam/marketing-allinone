'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 온보딩 직후 웰컴 드래프트(백그라운드 생성, 10~20초) 대기 표시.
 * 5초 간격으로 새로고침 — 초안이 생기면 서버컴포넌트가 이 컴포넌트 대신 브리핑을 렌더.
 *
 * 🔴 자가복구: 웰컴 드래프트가 실패(Gemini 오류·키 없음)하면 백그라운드가 조용히 삼켜
 * 초안이 영영 안 생김. ~45초 지나도 여전히 초안 0이면 "지연" 상태로 전환해
 * 사장님이 직접 첫 글을 만들 수 있게 한다(첫인상이 빈 대시보드로 방치되지 않게).
 */
const STALL_AFTER = 9; // × 5초 ≈ 45초

export function FirstDraftPending() {
  const router = useRouter();
  const count = useRef(0);
  const [stalled, setStalled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      count.current += 1;
      if (count.current >= STALL_AFTER) {
        clearInterval(t);
        setStalled(true);
        return;
      }
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [router]);

  async function generateNow() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetLength: 'medium', channels: ['naver_blog'] }),
      });
      if (!res.ok) {
        // 서버가 보낸 한국어 안내(일일 상한 등)를 우선 표시 — 고정 문구로 덮지 않는다
        let serverMsg: string | null = null;
        try {
          const data = await res.json();
          if (data?.error) serverMsg = data.error;
        } catch {
          /* 비-JSON 에러 바디 */
        }
        if (res.status === 429) throw new Error(serverMsg ?? 'Gemini 무료 한도를 다 썼어요. 결제를 연결하면 계속 만들 수 있어요.');
        if (res.status === 503) throw new Error(serverMsg ?? '아직 AI 키가 연결되지 않았어요. 설정에서 Gemini를 연결해주세요.');
        throw new Error(serverMsg ?? '생성에 실패했어요. 잠시 후 다시 시도해주세요.');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (stalled) {
    return (
      <div className="panel rounded-[var(--radius-lg)] p-8 text-center">
        <p className="text-[14px] font-medium">첫 글 생성이 예상보다 오래 걸려요</p>
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-[var(--color-fg-3)]">
          지금 바로 첫 글을 만들어 볼 수 있어요. 매장 정보로 알아서 써드려요.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={generateNow}
            disabled={loading}
            className="btn-primary rounded-full px-5 py-2.5 text-[13px] font-medium disabled:opacity-60"
          >
            {loading ? '만드는 중… (10~20초)' : '지금 첫 글 만들기'}
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-full border border-[var(--color-hair-strong)] px-4 py-2.5 text-[13px] text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
          >
            새로고침
          </button>
        </div>
        {error && <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-bad)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="panel rounded-[var(--radius-lg)] p-8 text-center">
      <div className="mx-auto flex items-center justify-center gap-2.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-amber)]" />
        <span className="text-[14px] font-medium">첫 블로그 초안을 만들고 있어요</span>
      </div>
      <p className="mt-2 text-[12.5px] text-[var(--color-fg-3)]">10~20초쯤 걸려요. 완성되면 여기에 나타납니다.</p>
    </div>
  );
}
