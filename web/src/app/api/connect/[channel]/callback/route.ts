import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { oauthConfigOf, redirectUriFor } from '@shared/channels/oauth-config';

export const runtime = 'nodejs';

/** 서명을 **검증한다**. 길이가 다르면 timingSafeEqual 이 던지므로 먼저 막는다. */
function verifyState(state: string, secret: string): { storeId: string; channel: string } | null {
  const [body, sig] = (state ?? '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    // 10분 지난 state 는 안 받는다 — 링크가 굴러다니다 쓰이는 걸 막는다
    if (typeof p.at !== 'number' || Date.now() - p.at > 10 * 60_000) return null;
    if (!p.storeId || !p.channel) return null;
    return { storeId: String(p.storeId), channel: String(p.channel) };
  } catch {
    return null;
  }
}

/**
 * 연결 콜백 — 코드를 토큰으로 바꿔 저장한다.
 *
 * 실패해도 고객에게 우리 사정(App ID·심사·에러 원문)을 보여주지 않는다.
 * 화면엔 "연결하지 못했어요"까지만 두고, 원인은 서버 로그와 activity_log 에 남긴다 —
 * 조용히 넘어가면 왜 안 붙는지 영영 모른다.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ channel: string }> }) {
  const { channel } = await ctx.params;
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/channels?${q}`, req.url));

  const cfg = oauthConfigOf(channel);
  if (!cfg) return back('error=unknown_channel');

  const clientId = process.env[cfg.clientIdEnv];
  const secret = process.env[cfg.clientSecretEnv];
  if (!clientId || !secret) return back('error=not_ready');

  // 고객이 창을 닫거나 거부한 경우 — 에러가 아니다. 조용히 되돌린다.
  if (url.searchParams.get('error')) return back('canceled=1');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back('error=connect_failed');

  const verified = verifyState(state, secret);
  // 🔴 서명이 안 맞으면 **남이 만든 링크**다. 절대 저장하지 않는다.
  if (!verified || verified.channel !== channel) return back('error=connect_failed');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  // state 의 매장이 **지금 로그인한 사람의 매장**인지 다시 확인한다(서명만 믿지 않는다)
  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
  if (!store || store.id !== verified.storeId) return back('error=connect_failed');

  const admin = createServiceClient();
  const logFail = async (why: string) => {
    await admin.from('activity_log').insert({
      store_id: store.id,
      event: 'channel_connect_failed',
      detail: { channel, message: why.slice(0, 500), at: new Date().toISOString() },
    }).then(() => {}, () => {});
  };

  try {
    const origin = url.origin;
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      redirect_uri: redirectUriFor(origin, channel),
      code,
      grant_type: 'authorization_code',
    });
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      // ⚠️ 원문에 client_secret 이 섞일 수 있으니 그대로 남기지 않는다
      await logFail(`token ${res.status}: ${text.replace(secret, '***').slice(0, 300)}`);
      return back('error=connect_failed');
    }
    const token = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!token.access_token) {
      await logFail('토큰 응답에 access_token 이 없다');
      return back('error=connect_failed');
    }

    // 이 연결로 함께 열리는 채널까지 한 번에 저장 — 고객을 세 번 로그인시키지 않는다
    const channels = [channel, ...(cfg.alsoConnects ?? [])];
    const rows = channels.map((id) => ({
      store_id: store.id,
      channel_id: id,
      status: 'connected',
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      metadata: { connectedAt: new Date().toISOString(), via: channel },
    }));
    const { error } = await admin
      .from('channel_connections')
      .upsert(rows, { onConflict: 'store_id,channel_id' });
    if (error) {
      await logFail(`저장 실패: ${error.message}`);
      return back('error=connect_failed');
    }

    return back(`connected=${channel}`);
  } catch (e) {
    await logFail((e as Error).message);
    return back('error=connect_failed');
  }
}
