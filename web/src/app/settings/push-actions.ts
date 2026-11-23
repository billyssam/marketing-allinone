'use server';

import { createClient } from '@/lib/supabase/server';
import { MAX_PUSH_DEVICES, parsePushSubscription, selectPushSubscriptions } from '@shared/push-subscription';

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

export async function savedPushEndpoints(): Promise<{ ok: boolean; endpoints: string[] }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, endpoints: [] };
  const { subscriptions } = selectPushSubscriptions(user.user_metadata?.push_subs);
  return { ok: true, endpoints: subscriptions.map(sub => sub.endpoint) };
}

export async function savePushSubscription(sub: PushSub): Promise<{ ok: boolean; error?: string }> {
  const valid = parsePushSubscription(sub);
  if (!valid) {
    return { ok: false, error: '구독 정보가 올바르지 않아요' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const prev = selectPushSubscriptions(user.user_metadata?.push_subs).subscriptions;
  const next = [valid, ...prev.filter(s => s.endpoint !== valid.endpoint)].slice(0, MAX_PUSH_DEVICES);

  const { error } = await supabase.auth.updateUser({ data: { push_subs: next } });
  if (error) return { ok: false, error: '알림 설정을 저장하지 못했어요. 다시 시도해주세요.' };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const prev = selectPushSubscriptions(user.user_metadata?.push_subs).subscriptions;
  const { error } = await supabase.auth.updateUser({
    data: { push_subs: prev.filter((s) => s.endpoint !== endpoint) },
  });
  if (error) return { ok: false, error: '알림 설정을 해제하지 못했어요. 다시 시도해주세요.' };
  return { ok: true };
}
