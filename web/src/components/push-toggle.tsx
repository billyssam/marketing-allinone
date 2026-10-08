'use client';

import { useEffect, useState } from 'react';
import { savePushSubscription, removePushSubscription, savedPushEndpoints } from '@/app/settings/push-actions';
import { bounded, devicePushEnabled } from '@shared/push-state';

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

export function PushToggle({ publicKey, emphasize = false }: { publicKey?: string; emphasize?: boolean }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    // ⚠️ iOS 판정이 **차단 판정보다 먼저**여야 한다.
    // 순서를 바꿨더니 아이폰 사장님에게 "브라우저 주소창의 자물쇠를 누르세요"가 떴다 —
    // 아이폰엔 그런 UI가 없다(2026-08-18 사장님 시뮬레이션, iOS UA로 실측).
    // 홈 화면에 추가하기 전엔 무슨 안내를 해도 소용이 없으므로 그것부터 말한다.
    if (isIos && !isStandalone) {
      setState('ios-needs-install');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    let alive = true;
    bounded(navigator.serviceWorker.ready)
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        const saved = await bounded(savedPushEndpoints());
        if (!alive) return;
        setState(devicePushEnabled(sub?.endpoint, saved.endpoints, Notification.permission === 'granted') ? 'on' : 'off');
        if (!saved.ok) setErr('알림 저장 상태를 확인하지 못했어요. 다시 켜서 확인해주세요.');
      })
      .catch(() => { if (alive) { setState('off'); setErr('알림 연결을 확인하지 못했어요. 다시 켜서 확인해주세요.'); } });
    return () => { alive = false; };
  }, []);

  async function enable() {
    if (!publicKey) {
      setErr('알림 연결을 확인하고 있어요. 대시보드에서는 초안을 계속 확인할 수 있어요.');
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
      const reg = await bounded(navigator.serviceWorker.ready);
      const existing = await reg.pushManager.getSubscription();
      const saved = await bounded(savedPushEndpoints());
      if (!saved.ok) throw new Error('구독 확인 실패');
      const sameOwner = existing && saved.endpoints.includes(existing.endpoint);
      // 공유 기기에서 이전 계정의 구독을 새 계정에 그대로 붙이지 않는다.
      if (existing && !sameOwner) await existing.unsubscribe();
      const sub = (sameOwner ? existing : null) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await bounded(savePushSubscription({
        endpoint: json.endpoint ?? '',
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      }));
      if (!res.ok) {
        setErr(res.error ?? '저장하지 못했어요');
        return;
      }
      setState('on');
    } catch (e) {
      setErr('알림을 켜지 못했어요. 브라우저 설정과 연결을 확인한 뒤 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setErr('');
    try {
      const reg = await bounded(navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const removed = await bounded(removePushSubscription(sub.endpoint));
        if (!removed.ok) throw new Error(removed.error);
        setState('off');
        const unsubscribed = await sub.unsubscribe();
        if (!unsubscribed) throw new Error('해제 실패');
      }
      setState('off');
    } catch {
      setErr('알림 해제를 완료하지 못했어요. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <p role="status" className="mt-3 text-[13px] text-[var(--color-fg-3)]">이 기기의 알림 상태를 확인하는 중…</p>;
  if (state === 'unsupported') return <p className="mt-3 text-[13px] text-[var(--color-fg-3)]">이 브라우저에서는 알림을 지원하지 않아요. 대시보드에서 초안을 확인해주세요.</p>;

  /**
   * 아직 한 대도 구독이 없으면 **눈에 띄게** 만든다.
   *
   * 매일 아침 글이 준비돼도 여기가 꺼져 있으면 사장님은 그걸 영영 모른다 —
   * 실사용자 한 분이 9일치 글을 한 번도 못 받았다(2026-08-26~09-08 실측).
   * ⚠️ 이 강조를 대시보드에 **별도 상자로** 넣었더니 같은 얘기가 두 번 나왔다.
   *    알림 상태를 아는 곳은 여기 하나뿐이므로 강조도 여기서 한다.
   */
  const box = emphasize
    ? 'mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-amber)]/40 bg-[var(--color-amber)]/[0.06] px-4 py-3.5'
    : 'panel mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] px-4 py-3';
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
          <span className="block text-[12px] text-[var(--color-fg-3)]">브라우저의 이 사이트 설정에서 알림을 허용해주세요. 아이폰은 기기 설정 → 알림에서 홈 화면 앱을 확인해주세요.</span>
        </span>
      </div>
    );
  }

  return (
    <div className={box}>
      <span className={label}>
        <b className="text-[var(--color-fg)]">아침 알림</b>
        <span className="block text-[12px] text-[var(--color-fg-3)]">
          {state === 'on' ? '이 기기의 알림 설정이 저장됐어요' : '초안 준비 알림을 이 기기로 받아보세요. 알림 없이도 대시보드에서 확인할 수 있어요.'}
        </span>
        {err && <span role="alert" className="block text-[12px] text-[var(--color-bad)]">{err}</span>}
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
        {busy ? '저장 중…' : state === 'on' ? '알림 끄기' : '알림 켜기'}
      </button>
    </div>
  );
}
