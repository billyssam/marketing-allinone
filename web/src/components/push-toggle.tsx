'use client';

import { useEffect, useState } from 'react';
import { savePushSubscription, removePushSubscription } from '@/app/settings/push-actions';

/**
 * 아침 알림 켜기 — 카톡봇 자리를 대신하는 모바일 진입점.
 *
 * 왜 필요한가: 매일 아침 글이 준비돼도 **사장님이 앱을 열어야만** 안다.
 * 열지 않으면 그날 글은 그냥 지나간다("올린 날 0/7"의 진짜 원인이 여기일 수 있다).
 * 알림톡은 심사 2주 + 건당 과금이라 지금 못 쓰고, 웹 푸시는 무료·즉시다.
 *
 * 정직하게 알린다: iOS는 **홈 화면에 추가한 뒤에만** 알림을 받을 수 있다(Safari 제약).
 * 안 되는 걸 되는 것처럼 두면 사장님은 알림을 기다리다 서비스를 접는다.
 */
type State = 'loading' | 'unsupported' | 'ios-needs-install' | 'off' | 'on' | 'denied';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ publicKey }: { publicKey?: string }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iOS Safari는 홈 화면 추가 전엔 PushManager 자체가 없다 — '미지원'이 아니라 '설치 먼저'다
      setState(isIos && !isStandalone ? 'ios-needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function enable() {
    if (!publicKey) {
      setErr('알림 설정이 아직 준비되지 않았어요(VAPID 키 없음)');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await savePushSubscription({
        endpoint: json.endpoint ?? '',
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      });
      if (!res.ok) {
        setErr(res.error ?? '저장하지 못했어요');
        return;
      }
      setState('on');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' || state === 'unsupported') return null;

  const box = 'panel mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] px-4 py-3';
  const label = 'text-[13px] text-[var(--color-fg-2)]';

  if (state === 'ios-needs-install') {
    return (
      <div className={box}>
        <span className={label}>
          <b className="text-[var(--color-fg)]">아침 알림</b>을 받으려면 먼저 홈 화면에 추가해 주세요
          <span className="block text-[12px] text-[var(--color-fg-3)]">공유 → 홈 화면에 추가 (아이폰은 이 방법만 됩니다)</span>
        </span>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className={box}>
        <span className={label}>
          알림이 차단돼 있어요
          <span className="block text-[12px] text-[var(--color-fg-3)]">브라우저 주소창의 자물쇠 → 알림 → 허용으로 바꿔주세요</span>
        </span>
      </div>
    );
  }

  return (
    <div className={box}>
      <span className={label}>
        <b className="text-[var(--color-fg)]">아침 알림</b>
        <span className="block text-[12px] text-[var(--color-fg-3)]">
          {state === 'on' ? '글이 준비되면 폰으로 알려드려요' : '켜두면 앱을 열지 않아도 오늘 글을 알려드려요'}
        </span>
        {err && <span className="block text-[12px] text-[var(--color-bad)]">{err}</span>}
      </span>
      <button
        type="button"
        onClick={state === 'on' ? disable : enable}
        disabled={busy}
        className={
          state === 'on'
            ? 'shrink-0 rounded-full border border-[var(--color-hair-strong)] px-4 py-1.5 text-[12.5px] text-[var(--color-fg-2)] disabled:opacity-40'
            : 'btn-primary shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-medium disabled:opacity-40'
        }
      >
        {busy ? '…' : state === 'on' ? '끄기' : '켜기'}
      </button>
    </div>
  );
}
