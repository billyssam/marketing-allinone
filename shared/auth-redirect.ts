/** Keep post-login navigation on this origin, including the draft query string. */
export function safeAuthRedirect(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u0020]/.test(decoded)) return fallback;
    const url = new URL(value, 'https://app.invalid');
    if (url.origin !== 'https://app.invalid') return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
