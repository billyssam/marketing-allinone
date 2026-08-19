import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Meta 데이터 삭제 콜백 — 인스타그램 앱 심사의 **필수 요건**.
 *
 * 사용자가 페이스북/인스타그램 설정에서 우리 앱 연결을 끊으면 Meta가 이 주소로 POST한다.
 * 우리는 그 사용자의 연동 데이터를 지우고, 확인용 URL과 코드를 돌려줘야 한다.
 * (Meta 문서: Data Deletion Request Callback — 앱 설정에 이 URL을 등록해야 심사 제출이 열린다)
 *
 * ⚠️ 무엇을 지우는가: **연동 정보만** 지운다(access_token·IG 계정 ID·인스타 연결).
 *    매장·글·리뷰는 우리 서비스의 데이터지 Meta에서 온 게 아니다 —
 *    인스타 연결만 끊었는데 사장님의 블로그 글까지 사라지면 그게 더 큰 사고다.
 *    계정 전체 삭제는 설정 화면의 탈퇴(deleteAccount)가 담당한다.
 *
 * 검증: Meta는 `signed_request`(base64url(sig).base64url(payload))를 보낸다.
 *       앱 시크릿으로 HMAC-SHA256을 다시 계산해 **서명이 맞을 때만** 처리한다.
 *       안 그러면 누구나 남의 연동을 끊을 수 있다.
 */

export const runtime = 'nodejs';

interface SignedPayload {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** 서명 검증 — 실패 사유를 밖으로 흘리지 않는다(공격자에게 힌트가 된다) */
export function parseSignedRequest(signed: string, appSecret: string): SignedPayload | null {
  const [sigPart, payloadPart] = (signed ?? '').split('.');
  if (!sigPart || !payloadPart) return null;

  let payload: SignedPayload;
  try {
    payload = JSON.parse(b64urlToBuffer(payloadPart).toString('utf8')) as SignedPayload;
  } catch {
    return null;
  }
  // Meta는 HMAC-SHA256만 쓴다. 다른 알고리즘을 주장하면 우회 시도로 본다.
  if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return null;

  const expected = createHmac('sha256', appSecret).update(payloadPart).digest();
  const got = b64urlToBuffer(sigPart);
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;

  return payload;
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // 키가 없으면 조용히 200을 주지 않는다 — "삭제했다"고 거짓말하는 셈이 된다
    console.error('[meta/data-deletion] META_APP_SECRET 미설정 — 요청을 처리할 수 없음');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // Meta는 form-urlencoded로 보낸다. 혹시 JSON으로 와도 받아준다.
  let signed = '';
  const ctype = req.headers.get('content-type') ?? '';
  if (ctype.includes('application/json')) {
    signed = ((await req.json().catch(() => ({}))) as { signed_request?: string }).signed_request ?? '';
  } else {
    const form = await req.formData().catch(() => null);
    signed = (form?.get('signed_request') as string) ?? '';
  }

  const payload = parseSignedRequest(signed, appSecret);
  if (!payload?.user_id) {
    return NextResponse.json({ error: 'invalid_signed_request' }, { status: 400 });
  }

  // 연동 해제 — 그 Meta 사용자로 연결된 인스타 채널만 지운다
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('channel_connections')
    .delete()
    .eq('channel_id', 'instagram')
    .eq('external_id', payload.user_id);
  if (error) {
    console.error('[meta/data-deletion] 연동 삭제 실패:', error.message);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  // Meta 규격: 확인 URL + 추적용 코드를 돌려준다. 사용자가 그 URL로 진행 상황을 볼 수 있어야 한다.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marketing-allinone.vercel.app';
  const code = `ig-${payload.user_id}`;
  return NextResponse.json({
    url: `${base}/legal/data-deletion?code=${encodeURIComponent(code)}`,
    confirmation_code: code,
  });
}

/** 상태 확인용 — 브라우저로 열었을 때 500이 아니라 안내가 뜨게 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    note: 'Meta Data Deletion Request Callback. POST signed_request only.',
  });
}
