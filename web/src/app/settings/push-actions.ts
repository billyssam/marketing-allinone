'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * 웹 푸시 구독 저장 — "매일 아침 폰으로 알려주기".
 *
 * 왜 여기(user_metadata)에 두나: 구독은 **기기**에 속하고 매장이 아니다(사장님이 폰·태블릿을 같이 쓸 수 있다).
 * 그리고 새 테이블을 만들면 Supabase 대시보드에서 SQL을 돌려야 하는데,
 * 그건 사장님(계정 주인) 손이 필요한 외부 게이트다 — 지금 그걸 또 만들면 안 된다.
 * user_metadata는 로그인한 본인이 갱신할 수 있어 마이그레이션 없이 바로 쓴다.
 *
 * endpoint를 키로 중복을 제거한다 — 같은 기기에서 여러 번 켜도 알림이 여러 번 오지 않게.
 */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const MAX_DEVICES = 5;

export async function savePushSubscription(sub: PushSub): Promise<{ ok: boolean; error?: string }> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: '구독 정보가 올바르지 않아요' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const prev = Array.isArray(user.user_metadata?.push_subs)
    ? (user.user_metadata.push_subs as PushSub[])
    : [];
  const next = [sub, ...prev.filter((s) => s.endpoint !== sub.endpoint)].slice(0, MAX_DEVICES);

  const { error } = await supabase.auth.updateUser({ data: { push_subs: next } });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const prev = Array.isArray(user.user_metadata?.push_subs)
    ? (user.user_metadata.push_subs as PushSub[])
    : [];
  const { error } = await supabase.auth.updateUser({
    data: { push_subs: prev.filter((s) => s.endpoint !== endpoint) },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
