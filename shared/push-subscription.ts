import { createECDH, ECDH, timingSafeEqual } from 'node:crypto';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const MAX_PUSH_DEVICES = 5;
const MAX_METADATA_ENTRIES = 50;

function keyBytes(value: unknown, length: number): Buffer | null {
  if (typeof value !== 'string' || value.length > 100 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === length && decoded.toString('base64url') === value.replace(/=+$/, '') ? decoded : null;
}

/** user_metadata is user-editable: accept production browser push services only. */
export function parsePushSubscription(value: unknown): PushSubscriptionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const sub = value as Partial<PushSubscriptionRecord>;
  if (typeof sub.endpoint !== 'string' || sub.endpoint.length > 4096) return null;
  let endpoint: URL;
  try { endpoint = new URL(sub.endpoint); } catch { return null; }
  const host = endpoint.hostname;
  const trusted = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.notify.windows.com') || host.endsWith('.push.apple.com');
  if (!trusted || endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || endpoint.hash ||
      (endpoint.pathname === '/' && !endpoint.search)) return null;
  const publicKey = keyBytes(sub.keys?.p256dh, 65);
  const auth = keyBytes(sub.keys?.auth, 16);
  if (!publicKey || publicKey[0] !== 4 || !auth) return null;
  try { ECDH.convertKey(publicKey, 'prime256v1'); } catch { return null; }
  return { endpoint: endpoint.href, keys: { p256dh: publicKey.toString('base64url'), auth: auth.toString('base64url') } };
}

export function selectPushSubscriptions(value: unknown, excluded: ReadonlySet<string> = new Set()): {
  subscriptions: PushSubscriptionRecord[]; rejected: number;
} {
  if (!Array.isArray(value)) return { subscriptions: [], rejected: value == null ? 0 : 1 };
  const subscriptions: PushSubscriptionRecord[] = [];
  const seen = new Set<string>();
  let rejected = Math.max(0, value.length - MAX_METADATA_ENTRIES);
  for (const raw of value.slice(0, MAX_METADATA_ENTRIES)) {
    const sub = parsePushSubscription(raw);
    if (!sub) { rejected++; continue; }
    if (excluded.has(sub.endpoint) || seen.has(sub.endpoint)) continue;
    seen.add(sub.endpoint);
    if (subscriptions.length === MAX_PUSH_DEVICES) { rejected++; continue; }
    subscriptions.push(sub);
  }
  return { subscriptions, rejected };
}

/** A well-formed public key and private key may still belong to different pairs. */
export function validVapidKeyPair(publicValue: unknown, privateValue: unknown): boolean {
  const pub = keyBytes(publicValue, 65), priv = keyBytes(privateValue, 32);
  if (!pub || !priv || pub[0] !== 4) return false;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    return timingSafeEqual(ecdh.getPublicKey(), pub);
  } catch { return false; }
}
