/**
 * 웹 푸시 발송 공용 모듈 — 아침 알림·부정 리뷰 경보가 같은 경로를 쓴다.
 *
 * 왜 공용인가: 발송 규칙(만료 구독 정리·기기 다중 등록)이 두 벌이 되면
 * 한쪽만 고쳐지고 다른 쪽은 조용히 낡는다. 구독은 `user_metadata.push_subs`에 산다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  /** 같은 태그면 알림이 쌓이지 않고 갱신된다 */
  tag?: string;
  url?: string;
}

/** VAPID 설정 — 키가 없으면 false(호출부가 조용히 건너뛰되 로그는 남긴다) */
export function configurePush(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com', pub, priv);
  return true;
}

export interface PushResult {
  sent: number;
  gone: number;
  failed: number;
}

/**
 * 매장 주인의 모든 기기로 보낸다.
 * 404/410(구독 만료)은 **지워둔다** — 안 지우면 매일 실패로 쌓여 진짜 실패가 묻힌다.
 */
export async function pushToOwner(
  supabase: SupabaseClient,
  ownerId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const out: PushResult = { sent: 0, gone: 0, failed: 0 };
  const { data: userRes } = await supabase.auth.admin.getUserById(ownerId);
  const meta = userRes?.user?.user_metadata ?? {};
  const subs = (meta.push_subs ?? []) as PushSub[];
  if (!subs.length) return out;

  const body = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub as unknown as webpush.PushSubscription, body);
      out.sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.auth.admin.updateUserById(ownerId, {
          user_metadata: { ...meta, push_subs: subs.filter((x) => x.endpoint !== sub.endpoint) },
        });
        out.gone++;
      } else {
        out.failed++;
      }
    }
  }
  return out;
}

/** 서비스롤 클라이언트 — 크론 스크립트 공용 */
export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
