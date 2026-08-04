'use client';

import { useEffect, useState } from 'react';

/**
 * 인앱 브라우저 안내 — 한국 자영업자는 카톡으로 링크를 받아 **카톡 인앱 브라우저**로 연다.
 * 인앱에서는 확실히 안 되는 것: PWA 설치(홈 화면에 추가).
 * 기기·버전에 따라 불안정한 것: 클립보드 쓰기, 앱 딥링크(naverblog:// 등).
 * → 붙여넣기가 제품의 핵심 동선이라, 인앱이면 외부 브라우저로 유도한다.
 *
 * (실기기 검증 전까지는 "차단"이 아니라 "안내"로 둔다 — 실제로 잘 되는 기기에서
 *  사용을 막아버리는 게 더 나쁘기 때문.)
 */
const IN_APP_PATTERNS = [
  { re: /KAKAOTALK/i, name: '카카오톡' },
  { re: /NAVER\(inapp/i, name: '네이버 앱' },
  { re: /Instagram/i, name: '인스타그램' },
  { re: /FBAN|FBAV/i, name: '페이스북' },
  { re: /Line\//i, name: '라인' },
  { re: /DaumApps/i, name: '다음 앱' },
];

function detect(ua: string): string | null {
  for (const p of IN_APP_PATTERNS) if (p.re.test(ua)) return p.name;
  return null;
}

export function InAppNotice() {
  const [app, setApp] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const found = detect(ua);
    if (!found) return;
    // 같은 세션에서 닫았으면 다시 띄우지 않는다(같은 안내 반복은 방해)
    try {
      if (sessionStorage.getItem('maio_inapp_closed') === '1') return;
    } catch {
      /* noop */
    }
    setApp(found);
  }, []);

  if (!app || closed) return null;

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const openExternal = () => {
    const url = window.location.href;
    if (isAndroid) {
      // Android: intent 스킴으로 기본 브라우저(크롬) 열기
      const noScheme = url.replace(/^https?:\/\//, '');
      window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
    } else {
      // iOS는 스킴으로 강제 이동이 막혀 있어 주소 복사 + 안내가 현실적
      navigator.clipboard?.writeText(url).catch(() => {});
      alert('주소를 복사했어요.\nSafari를 열고 주소창에 붙여넣기 해주세요.');
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--color-hair-strong)] bg-[var(--color-panel)] px-4 py-3.5 shadow-2xl">
      <div className="mx-auto flex max-w-md items-start gap-3">
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-amber)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{app} 안에서 열렸어요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-fg-3)]">
            여기서는 복사·앱 열기가 막힐 수 있어요. 크롬이나 사파리로 열면 홈 화면에 앱처럼 추가할 수도 있습니다.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={openExternal}
              className="rounded-full bg-[var(--color-amber)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-amber-ink)]"
            >
              {isAndroid ? '크롬으로 열기' : '주소 복사'}
            </button>
            <button
              type="button"
              onClick={() => {
                setClosed(true);
                try { sessionStorage.setItem('maio_inapp_closed', '1'); } catch { /* noop */ }
              }}
              className="rounded-full border border-[var(--color-hair-strong)] px-3.5 py-1.5 text-[12px] text-[var(--color-fg-2)]"
            >
              그냥 볼게요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
