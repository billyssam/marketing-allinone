const HOSTS: Record<string, string[]> = {
  blog: ['blog.naver.com'], naver_place: ['naver.com'], instagram: ['instagram.com'],
  facebook: ['facebook.com'], threads: ['threads.net', 'threads.com'],
  google_gbp: ['google.com', 'maps.app.goo.gl'], danggeun: ['daangn.com', 'karrotmarket.com'],
  naver_band: ['band.us'], kakao_channel: ['kakao.com'],
};

/** Evidence must point to this channel, never to a script or unrelated host. */
export function publicationUrl(raw: unknown, channel: string): string | null {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (!(HOSTS[channel] ?? []).some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

export function canConfirmPublication(status: string): boolean {
  return ['draft', 'ready', 'sent_to_owner'].includes(status);
}
