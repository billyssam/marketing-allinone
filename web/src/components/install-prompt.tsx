'use client';

import { useEffect, useState } from 'react';

/**
 * 홈 화면 추가 안내 — 매일 아침 여는 경로를 짧게 만든다.
 *
 * 왜 필요한가: 사장님은 카톡으로 받은 링크로 처음 들어온다. 홈 화면에 추가하지 않으면
 * **매일 그 카톡을 찾아 스크롤해야** 하고, 며칠이면 그냥 안 열게 된다.
 * PWA 요건(manifest·서비스워커)은 이미 갖췄는데 **설치를 권하는 화면이 없었다.**
 *
 * 안 띄우는 경우
 * - 이미 설치돼 실행 중(standalone) — 권할 이유가 없다
 * - 인앱 브라우저(카톡 등) — 여기선 설치가 아예 불가능하다. InAppNotice가 외부 브라우저로 안내한다.
 * - 사장님이 닫음 — 30일간 다시 묻지 않는다(매번 뜨면 그게 더 방해다)
 */
const DISMISS_KEY = 'maio_install_dismissed_at';
const DISMISS_DAYS = 30;

type Mode = 'none' | 'android' | 'ios';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>('none');
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // 인앱 브라우저에서는 설치 자체가 안 된다 — 여기서 권하면 되지도 않는 걸 시키는 셈
    if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line|DaumApps/i.test(ua)) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86_400_000) return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 배너 대신 우리 자리에서 권한다
      setDeferred(e as InstallEvent);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS Safari는 beforeinstallprompt가 없다 → 수동 절차를 글로 안내해야 한다
    const isIosSafari = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIosSafari) setMode('ios');

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (mode === 'none') return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setMode('none');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    dismiss(); // 수락했든 아니든 이번 건은 끝 — 다시 조르지 않는다
  };

  return (
    <div className="mt-8 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-panel)] p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-amber)] font-mono text-[13px] font-semibold text-[var(--color-amber-ink)]">
        ㅁ
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-[var(--color-fg)]">홈 화면에 추가해두면 편해요</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-fg-2)]">
          {mode === 'ios'
            ? '아래 공유 버튼(⬆️) → "홈 화면에 추가"를 누르면 앱처럼 열립니다. 매일 카톡을 찾지 않아도 돼요.'
            : '한 번 추가해두면 앱처럼 바로 열립니다. 매일 카톡을 찾지 않아도 돼요.'}
        </p>
        <div className="mt-3 flex items-center gap-2">
          {mode === 'android' && (
            <button
              type="button"
              onClick={install}
              className="rounded-full bg-[var(--color-amber)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--color-amber-ink)] transition hover:brightness-105"
            >
              홈 화면에 추가
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-2.5 py-1.5 text-[12.5px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg-2)]"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
