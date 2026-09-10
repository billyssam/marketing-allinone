import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { oauthConfigOf, buildAuthUrl } from '@shared/channels/oauth-config';

export const runtime = 'nodejs';

/**
 * 채널 연결 시작 — 고객을 해당 서비스의 로그인 화면으로 보낸다.
 *
 * 고객이 하는 일은 **버튼 한 번**이다. 앱 등록·심사는 우리가 이미 끝내 뒀고,
 * 고객은 App ID 가 뭔지 몰라도 된다([[feedback-operator-vs-customer-setup]]).
 *
 * 🔴 `state` 를 빼면 CSRF 로 **남의 계정이 내 매장에 붙을 수 있다.**
 * 그래서 매장 id + 무작위 nonce 를 서명해 넣고, 콜백에서 서명을 검증한다.
 * (쿠키만 쓰면 사파리 ITP·인앱 브라우저에서 조용히 날아간다 — 서명 방식이 안전하다)
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ channel: string }> }) {
  const { channel } = await ctx.params;
  const cfg = oauthConfigOf(channel);
  if (!cfg) {
    return NextResponse.redirect(new URL('/channels?error=unknown_channel', req.url));
  }

  const clientId = process.env[cfg.clientIdEnv];
  const secret = process.env[cfg.clientSecretEnv];
  if (!clientId || !secret) {
    // 우리 준비가 안 됐다 — 고객에게 "곧 열려요"로 되돌린다(App ID 얘기를 꺼내지 않는다)
    return NextResponse.redirect(new URL('/channels?error=not_ready', req.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
  if (!store) return NextResponse.redirect(new URL('/onboarding', req.url));

  // state = 매장·채널·nonce 를 담고 우리 시크릿으로 서명. 콜백에서 위조를 잡는다.
  const payload = JSON.stringify({
    storeId: store.id as string,
    channel,
    nonce: randomBytes(12).toString('hex'),
    at: Date.now(),
  });
  const body = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  const state = `${body}.${sig}`;

  // URL 조립은 shared 에 두고 테스트로 지킨다 — 파라미터 하나가 빠져도 실제 OAuth 를
  // 돌려야만 알 수 있는 종류의 결함이라, 라우트 안에 두면 영영 검증이 안 된다.
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(buildAuthUrl({ cfg, clientId, origin, channel, state }));
}
