import { checkPlaceUrl, type PlaceUrlCheck } from '@shared/content-engine/place-facts';

/**
 * 플레이스 주소 확인 — 단축 링크(naver.me)는 서버에서 펼쳐서 확인한다.
 *
 * 사장님이 네이버 지도 앱에서 "공유"를 누르면 `https://naver.me/xxxx` 형태가 나온다.
 * 이게 가장 흔한 입력인데 그 안에는 place id가 없어서, 그대로 저장하면
 * 크롤이 매일 실패하고 사실 없는 글이 나간다.
 *
 * ⚠️ 실제 naver.me 링크는 사장님 것뿐이라 개발 중 실측이 불가능했다.
 *    그래서 **실패해도 안전하게** 설계했다 — 못 펼치면 저장을 막고 안내할 뿐,
 *    잘못된 값을 추측해서 넣지 않는다.
 */
export async function resolvePlaceUrl(raw: string | null | undefined): Promise<PlaceUrlCheck> {
  const first = checkPlaceUrl(raw);
  if (first.ok || first.reason !== 'shortlink') return first;

  try {
    const res = await fetch((raw ?? '').trim(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
    });
    const loc = res.headers.get('location');
    if (loc) {
      const next = checkPlaceUrl(loc);
      if (next.ok) return next;
    }
  } catch {
    /* 네트워크 실패는 '못 펼침'으로 취급 — 추측해서 저장하지 않는다 */
  }
  return { ok: false, reason: 'shortlink' };
}

/** 사장님에게 보여줄 안내 — 무엇을 어떻게 고쳐야 하는지까지 */
export function placeUrlMessage(reason: 'shortlink' | 'unknown'): string {
  return reason === 'shortlink'
    ? '단축 주소(naver.me)는 확인이 어려워요. 네이버 지도에서 가게를 연 뒤 브라우저 주소창의 전체 주소를 넣어주세요.'
    : '네이버 플레이스 주소가 아닌 것 같아요. 지도에서 가게를 열었을 때 주소(map.naver.com 또는 m.place.naver.com)를 넣어주세요.';
}
