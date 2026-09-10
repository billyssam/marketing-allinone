import bcrypt from 'bcryptjs';

/**
 * 네이버 커머스 API 인증·호출 — **shared 에 두는 이유**가 있다.
 *
 * 고객이 판매자센터 키를 붙여넣는 화면(web)과 지표를 긁는 배치(backend)가
 * **같은 검증**을 써야 한다. 한쪽만 검증하면 "저장은 됐는데 안 도는" 상태가 생기고,
 * 화면은 그걸 "연결됨"으로 보여준다 — 이 프로젝트가 여러 번 밟은 함정이다.
 *
 * 인증 방식: OAuth2 client_credentials + **bcrypt 전자서명**.
 *   password           = `${clientId}_${timestamp}`
 *   client_secret_sign = base64( bcrypt(password, clientSecret) )   ← clientSecret 이 곧 salt 다
 */
export const COMMERCE = 'https://api.commerce.naver.com/external';

/** 서버 시계가 조금 빨라도 거절당하지 않도록 뒤로 당긴다(네이버가 미래 timestamp 를 거절한다) */
const CLOCK_SKEW_MS = 3_000;

/** 변경상품주문 조회는 한 번에 **24시간**까지만 본다 — 그래서 하루씩 끊는다 */
export const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 한 번의 지표 수집에서 볼 수 있는 최대 일수 — 무한 루프와 과호출을 동시에 막는다 */
export const MAX_DAYS = 62;

/**
 * 전자서명 만들기.
 *
 * clientSecret 은 비밀번호가 아니라 **bcrypt salt**(`$2a$10$...` 형태)다.
 * 그래서 같은 (clientId, timestamp) 면 결과가 항상 같다 — 테스트로 못 박을 수 있다.
 */
export function signClientSecret(clientId: string, clientSecret: string, timestamp: number): string {
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, 'utf-8').toString('base64');
}

/** 에러 메시지에 시크릿이 섞여 나가지 않게 지운다 — 로그는 남고 키는 남으면 안 된다 */
export function scrub(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join('***');
  return out.slice(0, 300);
}

export interface SmartstoreToken {
  access_token: string;
  expires_in: number;
}

/**
 * 액세스 토큰 발급. 실패하면 **던진다** — 조용히 undefined 를 들고 '연결됨' 이 되지 않도록.
 */
export async function issueToken(clientId: string, clientSecret: string): Promise<SmartstoreToken> {
  const timestamp = Date.now() - CLOCK_SKEW_MS;
  const res = await fetch(`${COMMERCE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      timestamp: String(timestamp),
      client_secret_sign: signClientSecret(clientId, clientSecret, timestamp),
      grant_type: 'client_credentials',
      type: 'SELF',
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`토큰 발급 실패(${res.status}) ${scrub(text, clientId, clientSecret)}`);
  }
  let json: Partial<SmartstoreToken>;
  try {
    json = JSON.parse(text) as Partial<SmartstoreToken>;
  } catch {
    throw new Error(`토큰 응답이 JSON 이 아니다: ${scrub(text, clientId, clientSecret)}`);
  }
  if (!json.access_token) {
    throw new Error(`토큰이 비어 있다: ${scrub(text, clientId, clientSecret)}`);
  }
  return { access_token: json.access_token, expires_in: json.expires_in ?? 10_800 };
}

export async function commerceGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${COMMERCE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} 실패(${res.status}) ${scrub(text, token)}`);
  return text ? JSON.parse(text) : null;
}

export async function commercePost(token: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${COMMERCE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} 실패(${res.status}) ${scrub(text, token)}`);
  return text ? JSON.parse(text) : null;
}

/** `2026-09-10T00:00:00.000+09:00` — 네이버는 오프셋이 붙은 형태만 받는다 */
export function kstIso(ms: number): string {
  const KST = 9 * 60 * 60 * 1000;
  return new Date(ms + KST).toISOString().replace('Z', '+09:00');
}

/**
 * 조회 구간을 **24시간 이하 조각**으로 쪼갠다.
 * 한 번에 넓게 물으면 네이버가 거절하는데, 거절을 삼키면 "주문 0건"으로 보인다 —
 * 매출이 0이라는 말과 구분이 안 되는 종류라 반드시 쪼개서 물어야 한다.
 */
export function splitWindows(fromMs: number, toMs: number): { from: number; to: number }[] {
  if (!(toMs > fromMs)) return [];
  const capped = Math.min(toMs, fromMs + MAX_DAYS * MAX_WINDOW_MS);
  const out: { from: number; to: number }[] = [];
  for (let cur = fromMs; cur < capped; cur += MAX_WINDOW_MS) {
    out.push({ from: cur, to: Math.min(cur + MAX_WINDOW_MS, capped) });
  }
  return out;
}

export interface KeyCheck {
  ok: boolean;
  /** 성공 시 스토어 이름·채널번호 — 고객에게 "이 스토어 맞나요?" 를 보여줄 수 있다 */
  storeName?: string;
  externalId?: string;
  accessToken?: string;
  expiresAt?: string;
  error?: string;
}

/**
 * 붙여넣은 키가 **진짜 도는지** 실제로 한 번 불러 본다.
 *
 * 🔴 저장만 하고 '연결됨' 이라고 적으면, 오타 난 키를 넣은 사장님은
 * 한 달 뒤 지표가 비어 있을 때까지 모른다. 저장 순간에 판정한다.
 */
export async function verifySmartstoreKey(clientId: string, clientSecret: string): Promise<KeyCheck> {
  try {
    const token = await issueToken(clientId, clientSecret);
    const channels = (await commerceGet(token.access_token, '/v1/seller/channels')) as
      | { channelNo?: number; name?: string }[]
      | null;
    const first = Array.isArray(channels) ? channels[0] : undefined;
    return {
      ok: true,
      storeName: first?.name,
      externalId: first?.channelNo != null ? String(first.channelNo) : undefined,
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    };
  } catch (e) {
    return { ok: false, error: scrub((e as Error).message, clientId, clientSecret) };
  }
}
