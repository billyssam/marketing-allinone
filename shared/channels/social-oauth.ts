import { FACEBOOK_GRAPH_BASE, THREADS_GRAPH_BASE, type OAuthConfig } from './oauth-config';

export interface SocialToken {
  accessToken: string;
  expiresIn: number;
  issuedAt: number;
  subjectId?: string;
}
export interface FacebookPage { id: string; name: string; accessToken: string }

export function socialConnectionUsable(connection: { status?: string; access_token?: string | null; external_id?: string | null; expires_at?: string | null }, now = Date.now()): boolean {
  const expires = connection.expires_at ? Date.parse(connection.expires_at) : NaN;
  return connection.status === 'connected' && Boolean(connection.access_token && connection.external_id)
    && Number.isFinite(expires) && expires > now;
}

/** Never propagate provider bodies, request URLs, or fetch errors containing credentials. */
async function json(url: string, init: RequestInit, fetcher: typeof fetch): Promise<any> {
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error();
    const body = await response.json();
    if (!body || typeof body !== 'object' || body.error) throw new Error();
    return body;
  } catch { throw new Error('채널 제공자 응답을 확인하지 못했습니다'); }
}
function accessToken(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 8192 || /\s/.test(value)) throw new Error('토큰 형식이 올바르지 않습니다');
  return value;
}
function duration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 366 * 86400) throw new Error('토큰 유효기간을 확인하지 못했습니다');
  return value;
}
const bearer = (token: string) => ({ Authorization: `Bearer ${accessToken(token)}` });

export async function exchangeSocialCode(channel: 'facebook' | 'threads', cfg: OAuthConfig, args: {
  clientId: string; secret: string; code: string; redirectUri: string;
}, fetcher: typeof fetch = fetch): Promise<SocialToken> {
  const short = await json(cfg.tokenUrl, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: args.clientId, client_secret: args.secret, code: args.code,
      redirect_uri: args.redirectUri, grant_type: 'authorization_code' }),
  }, fetcher);
  const initial = accessToken(short.access_token);
  const url = new URL(channel === 'threads' ? `${THREADS_GRAPH_BASE}/access_token` : cfg.tokenUrl);
  url.searchParams.set('grant_type', channel === 'threads' ? 'th_exchange_token' : 'fb_exchange_token');
  url.searchParams.set('client_secret', args.secret);
  if (channel === 'facebook') url.searchParams.set('client_id', args.clientId);
  url.searchParams.set(channel === 'threads' ? 'access_token' : 'fb_exchange_token', initial);
  // Provider-documented GET exchange. URL never leaves this server helper or enters errors/logs.
  const long = await json(url.toString(), { method: 'GET' }, fetcher);
  const subjectId = channel === 'threads' ? String(short.user_id ?? '') : undefined;
  if (channel === 'threads' && !/^\d+$/.test(subjectId!)) throw new Error('Threads 계정을 확인하지 못했습니다');
  return { accessToken: accessToken(long.access_token), expiresIn: duration(long.expires_in), issuedAt: Date.now(), subjectId };
}

export async function facebookPages(token: string, fetcher: typeof fetch = fetch): Promise<FacebookPage[]> {
  const permissions = await json(`${FACEBOOK_GRAPH_BASE}/me/permissions`, { headers: bearer(token) }, fetcher);
  const granted = new Set((Array.isArray(permissions.data) ? permissions.data : [])
    .filter((p: any) => p.status === 'granted').map((p: any) => p.permission));
  for (const p of ['pages_show_list', 'pages_read_engagement']) if (!granted.has(p)) throw new Error('페이지 조회 권한이 필요합니다');
  const pages: FacebookPage[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (let batch = 0; batch < 10; batch++) {
    const url = new URL(`${FACEBOOK_GRAPH_BASE}/me/accounts`);
    url.searchParams.set('fields', 'id,name,access_token'); url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const result = await json(url.toString(), { headers: bearer(token) }, fetcher);
    if (!Array.isArray(result.data)) throw new Error('페이지 목록이 올바르지 않습니다');
    for (const page of result.data) {
      if (typeof page.id !== 'string' || !/^\d+$/.test(page.id) || seen.has(page.id)) throw new Error('페이지 식별자가 올바르지 않습니다');
      seen.add(page.id);
      pages.push({ id: page.id, name: typeof page.name === 'string' ? page.name.slice(0, 160) : 'Facebook 페이지', accessToken: accessToken(page.access_token) });
    }
    if (!result.paging?.next) {
      if (!pages.length) throw new Error('관리할 페이지가 없습니다');
      return pages;
    }
    const cursor = result.paging?.cursors?.after;
    if (typeof cursor !== 'string' || !cursor || cursor.length > 4096 || cursor === after) throw new Error('페이지 목록을 끝까지 확인하지 못했습니다');
    after = cursor; // Never follow a provider-supplied next URL carrying tokens or an arbitrary host.
  }
  throw new Error('페이지가 너무 많습니다. 연결 허용 범위를 줄여주세요');
}

export async function verifyFacebookPage(page: FacebookPage, fetcher: typeof fetch = fetch): Promise<void> {
  if (!/^\d+$/.test(page.id)) throw new Error('페이지 식별자가 올바르지 않습니다');
  const result = await json(`${FACEBOOK_GRAPH_BASE}/me?fields=id`, { headers: bearer(page.accessToken) }, fetcher);
  if (result.id !== page.id) throw new Error('선택한 페이지와 토큰의 계정이 다릅니다');
}

export async function threadsIdentity(token: string, expectedId?: string, fetcher: typeof fetch = fetch): Promise<{ externalId: string }> {
  const profile = await json(`${THREADS_GRAPH_BASE}/me?fields=id,username`, { headers: bearer(token) }, fetcher);
  if (typeof profile.id !== 'string' || !/^\d+$/.test(profile.id) || (expectedId && profile.id !== expectedId)) throw new Error('Threads 계정이 일치하지 않습니다');
  return { externalId: profile.id };
}

export async function refreshThreadsToken(token: SocialToken, fetcher: typeof fetch = fetch, now = Date.now()): Promise<SocialToken> {
  const age = now - token.issuedAt;
  if (!Number.isFinite(age) || age < 86400_000 || age >= token.expiresIn * 1000) throw new Error('갱신 가능한 유효 토큰이 아닙니다. 만료되면 다시 연결해주세요');
  const url = new URL(`${THREADS_GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set('grant_type', 'th_refresh_token');
  const result = await json(url.toString(), { headers: bearer(token.accessToken) }, fetcher);
  return { accessToken: accessToken(result.access_token), expiresIn: duration(result.expires_in), issuedAt: now, subjectId: token.subjectId };
}
