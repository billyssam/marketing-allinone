import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyOAuthState(state: string, secret: string): { storeId: string; channel: string } | null {
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  const expected = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const now = Date.now();
    if (typeof payload.at !== 'number' || !Number.isFinite(payload.at) || payload.at > now + 30_000 || now - payload.at > 10 * 60_000) return null;
    if (typeof payload.storeId !== 'string' || !payload.storeId || typeof payload.channel !== 'string' || !payload.channel) return null;
    return { storeId: payload.storeId, channel: payload.channel };
  } catch { return null; }
}
