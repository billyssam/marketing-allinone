import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { oauthConfigOf } from '@shared/channels/oauth-config';
import { facebookPages, verifyFacebookPage } from '@shared/channels/social-oauth';
import { FACEBOOK_SELECTION_COOKIE, FACEBOOK_SELECTION_PATH, openFacebookSelection, facebookSelectionHtml } from '@shared/channels/facebook-selection';

export const runtime = 'nodejs';

async function context(req: NextRequest) {
  const cfg = oauthConfigOf('facebook');
  const secret = cfg && process.env[cfg.clientSecretEnv];
  if (!secret) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
  if (!store) return null;
  const pending = openFacebookSelection(req.cookies.get(FACEBOOK_SELECTION_COOKIE)?.value ?? '', secret, user.id, store.id);
  return pending ? { supabase, store, pending } : null;
}
function back(req: NextRequest, query: string) {
  const response = NextResponse.redirect(new URL(`/channels?${query}`, req.url), 303);
  response.cookies.set(FACEBOOK_SELECTION_COOKIE, '', { path: FACEBOOK_SELECTION_PATH, maxAge: 0, httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:' });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req);
    if (!ctx) return back(req, 'error=connect_failed');
    const pages = await facebookPages(ctx.pending.token.accessToken);
    return new NextResponse(facebookSelectionHtml(pages.map(({ id, name }) => ({ id, name })), ctx.pending.nonce), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" },
    });
  } catch { return back(req, 'error=connect_failed'); }
}
async function smallForm(req: NextRequest): Promise<URLSearchParams> {
  if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') || !req.body) throw new Error('Invalid form');
  const reader = req.body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2048) { await reader.cancel(); throw new Error('Form too large'); }
    parts.push(value);
  }
  return new URLSearchParams(Buffer.concat(parts).toString('utf8'));
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return back(req, 'error=connect_failed');
  try {
    const ctx = await context(req);
    if (!ctx) return back(req, 'error=connect_failed');
    const form = await smallForm(req), pageId = form.get('pageId');
    if (form.get('nonce') !== ctx.pending.nonce || !pageId || !/^\d+$/.test(pageId)) return back(req, 'error=connect_failed');
    // Re-read the owner's allowed pages; a submitted ID is never trusted on its own.
    const pages = await facebookPages(ctx.pending.token.accessToken);
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return back(req, 'error=connect_failed');
    await verifyFacebookPage(page);
    const token = ctx.pending.token;
    const { error } = await ctx.supabase.from('channel_connections').upsert({
      store_id: ctx.store.id, channel_id: 'facebook', status: 'connected', external_id: page.id,
      access_token: page.accessToken, refresh_token: null,
      expires_at: new Date(token.issuedAt + token.expiresIn * 1000).toISOString(),
      metadata: { connectedAt: new Date().toISOString(), via: 'facebook', identityVerified: true,
        permissionMode: 'read', tokenIssuedAt: token.issuedAt, tokenLifetimeSeconds: token.expiresIn },
    }, { onConflict: 'store_id,channel_id' });
    return back(req, error ? 'error=connect_failed' : 'connected=facebook');
  } catch { return back(req, 'error=connect_failed'); }
}
