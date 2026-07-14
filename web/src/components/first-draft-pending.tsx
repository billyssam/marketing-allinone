'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 온보딩 직후 웰컴 드래프트(백그라운드 생성, 10~20초) 대기 표시.
 * 5초 간격 최대 12회 새로고침 — 초안이 생기면 서버컴포넌트가 이 컴포넌트 대신 브리핑을 렌더.
 */
export function FirstDraftPending() {
  const router = useRouter();
  const count = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      count.current += 1;
      if (count.current > 12) {
        clearInterval(t);
        return;
      }
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [router]);

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
