/** Check the browser Origin against the actual HTTP Host, not Next's internal
 * listening hostname (which may be localhost behind a proxy). Never trust a
 * caller-supplied forwarded-host. Browsers cannot forge Host or Origin.
 */
export function sameOriginRequest(request: { url: string; headers: { get(name: string): string | null } }): boolean {
  try {
    const raw = request.headers.get('origin'); if (!raw) return false;
    const origin = new URL(raw);
    if (origin.origin !== raw || !['https:', 'http:'].includes(origin.protocol)) return false;
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? url.host;
    if (/[\s/@?#\\,]/.test(host)) return false;
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? url.protocol.slice(0, -1);
    if (!['https', 'http'].includes(protocol)) return false;
    return origin.origin === new URL(`${protocol}://${host}`).origin;
  } catch { return false; }
}
