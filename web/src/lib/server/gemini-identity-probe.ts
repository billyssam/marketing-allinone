import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 512;
const MAX_WINDOW_MS = 15 * 60 * 1000;
const PURPOSE = 'marketing-allinone:gemini-identity:v1\0';
type Environment = Record<string, string | undefined>;
const headers = { 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' };
const hidden = () => new Response(null, { status: 404, headers });

// No key, fixed fingerprint, candidate proof, or authorization token is logged/returned.
export async function checkGeminiIdentity(request: Request, env: Environment, now = Date.now()): Promise<Response> {
  if (request.method !== 'POST' || env.VERCEL_ENV !== 'production') return hidden();
  let config: { tokenSha256: string; issuedAt: number; expiresAt: number };
  try {
    config = JSON.parse(env.GEMINI_IDENTITY_PROBE_CONFIG ?? '');
    if (!/^[a-f0-9]{64}$/.test(config.tokenSha256)
      || !Number.isSafeInteger(config.issuedAt) || !Number.isSafeInteger(config.expiresAt)
      || config.issuedAt > now || config.expiresAt <= now
      || config.expiresAt <= config.issuedAt || config.expiresAt - config.issuedAt > MAX_WINDOW_MS) return hidden();
  } catch { return hidden(); }
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) return hidden();
  const tokenHash = createHash('sha256').update(authorization.slice(7)).digest();
  if (!timingSafeEqual(tokenHash, Buffer.from(config.tokenSha256, 'hex'))) return hidden();
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return new Response(null, { status: 415, headers });
  }

  let input: { nonce: string; proof: string };
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers });
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return new Response(null, { status: 413, headers });
      }
      parts.push(chunk.value);
    }
    input = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!input || Object.keys(input).sort().join(',') !== 'nonce,proof'
      || !/^[a-f0-9]{64}$/.test(input.nonce) || !/^[a-f0-9]{64}$/.test(input.proof)) {
      return new Response(null, { status: 400, headers });
    }
  } catch { return new Response(null, { status: 400, headers }); }

  // Match the application's nullish precedence, including its empty-primary failure.
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!key || key === '[SENSITIVE]') return new Response(null, { status: 503, headers });
  const expected = createHmac('sha256', key).update(PURPOSE + input.nonce).digest();
  const match = timingSafeEqual(expected, Buffer.from(input.proof, 'hex'));
  const deploymentSha = /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? '')
    ? env.VERCEL_GIT_COMMIT_SHA : null;
  return Response.json({ match, deploymentSha, checkedAt: new Date(now).toISOString() }, { headers });
}
