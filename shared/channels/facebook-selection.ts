import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { FacebookPage, SocialToken } from './social-oauth';

export const FACEBOOK_SELECTION_COOKIE = 'maio_facebook_selection';
export const FACEBOOK_SELECTION_PATH = '/api/connect/facebook/select';
export interface PendingFacebook {
  ownerId: string; storeId: string; nonce: string; expiresAt: number; token: SocialToken;
}
const key = (secret: string) => createHash('sha256').update('maio-facebook-selection-v1\0').update(secret).digest();

export function sealFacebookSelection(ownerId: string, storeId: string, token: SocialToken, secret: string, now = Date.now()): string {
  if (!secret || !ownerId || !storeId) throw new Error('페이지 선택 정보를 만들지 못했습니다');
  const pending: PendingFacebook = { ownerId, storeId, token, nonce: randomBytes(24).toString('base64url'), expiresAt: now + 10 * 60_000 };
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(pending), 'utf8'), cipher.final()]);
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  if (sealed.length > 3800) throw new Error('페이지 선택 정보를 안전하게 보관하지 못했습니다');
  return sealed;
}

export function openFacebookSelection(value: string, secret: string, ownerId: string, storeId: string, now = Date.now()): PendingFacebook | null {
  try {
    if (!value || value.length > 3800 || !secret || !/^[\w-]+$/.test(value)) return null;
    const bytes = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')) as PendingFacebook;
    if (p.ownerId !== ownerId || p.storeId !== storeId || !/^[\w-]{32}$/.test(p.nonce) || !Number.isFinite(p.expiresAt)
      || p.expiresAt <= now || p.expiresAt > now + 10 * 60_000 || !p.token?.accessToken
      || !Number.isFinite(p.token.issuedAt) || p.token.issuedAt > now || !Number.isFinite(p.token.expiresIn) || p.token.expiresIn <= 0
      || p.token.issuedAt + p.token.expiresIn * 1000 <= now) return null;
    return p;
  } catch { return null; }
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function facebookSelectionHtml(pages: Pick<FacebookPage, 'id' | 'name'>[], nonce: string): string {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facebook 페이지 선택 · 마케팅올인원</title><style>body{font:16px system-ui;background:#101112;color:#f4f4f4;margin:0;padding:32px}main{max-width:560px;margin:48px auto}button{display:block;width:100%;text-align:left;padding:18px;margin:12px 0;border:1px solid #666;border-radius:12px;background:#202124;color:inherit;font:inherit}a{color:#ffd166}small{color:#ccc}</style><main><h1>연결할 페이지를 골라주세요</h1><p>선택한 페이지의 계정을 확인해 연결합니다. 게시는 글을 확인한 뒤 직접 진행해주세요.</p><form method="post" action="${FACEBOOK_SELECTION_PATH}"><input type="hidden" name="nonce" value="${escape(nonce)}">${pages.map((p) => `<button type="submit" name="pageId" value="${escape(p.id)}">${escape(p.name)}<br><small>페이지 ${escape(p.id)}</small></button>`).join('')}</form><a href="/channels">취소하고 채널로 돌아가기</a></main></html>`;
}
