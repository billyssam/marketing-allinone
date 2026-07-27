'use client';

import { useEffect } from 'react';

/**
 * 서비스 워커 등록 — PWA 설치 요건(fetch 핸들러 있는 SW) 충족용.
 * 이게 없으면 Android Chrome이 "앱 설치"를 제안하지 않는다(실측: swRegistered=none).
 * updateViaCache:'none' — SW 파일 자체는 항상 새로 받아 배포가 즉시 반영되게.
 */
export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // 개발 중에는 등록하지 않는다 — HMR·라우팅 캐시와 충돌 방지
    if (process.env.NODE_ENV !== 'production') return;
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          /* 등록 실패해도 앱 동작에는 영향 없음 */
        });
    };
    if (document.readyState === 'complete') onLoad();
    else {
      window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  return null;
}
