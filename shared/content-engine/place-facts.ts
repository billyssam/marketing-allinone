import type { BrandTone, PlaceInfo } from './types';

/**
 * 네이버 플레이스 주소 검증 — **저장 시점에** 잡는다.
 *
 * 지금까지 입력값을 그대로 저장했다. 잘못 넣으면 크롤이 매일 조용히 실패하고
 * 사실 없는 글이 계속 나간다(사장님은 왜 메뉴·영업시간이 안 들어가는지 모른다).
 * 크롤 단계 격리는 이미 넣었지만, 애초에 못 들어오게 막는 쪽이 낫다.
 *
 * ⚠️ playwright에 의존하지 않는 순수 함수라 웹(서버 액션)에서도 안전하다.
 *    place-crawler의 extractPlaceId를 쓰면 barrel이 playwright를 끌어와 빌드가 깨진다.
 */
const PLACE_ID_PATTERNS = [
  /place\/(\d{6,})/, // m.place.naver.com/place/123/home · map.naver.com/p/entry/place/123
  /placePath.*?\/(\d{6,})/,
  /\/(\d{6,})(?:\/|\?|$)/, // 마지막 폴백: 경로 끝 숫자
];

export type PlaceUrlCheck =
  | { ok: true; placeId: string; url: string }
  | { ok: false; reason: 'empty' | 'shortlink' | 'unknown' };

export function checkPlaceUrl(raw: string | null | undefined): PlaceUrlCheck {
  const s = (raw ?? '').trim();
  if (!s) return { ok: false, reason: 'empty' }; // 플레이스는 선택 입력이라 빈 값은 오류가 아니다

  // 지도 앱 공유는 naver.me 단축 링크로 나온다 — 여기서는 ID를 알 수 없어 서버가 펼쳐야 한다
  if (/naver\.me\//i.test(s)) return { ok: false, reason: 'shortlink' };

  for (const re of PLACE_ID_PATTERNS) {
    const m = s.match(re);
    if (m) return { ok: true, placeId: m[1], url: `https://m.place.naver.com/place/${m[1]}/home` };
  }
  return { ok: false, reason: 'unknown' };
}

/**
 * 네이버 플레이스 영업시간 문자열 정제.
 * 크롤러가 상태 배지·라스트오더 중첩 span을 구분자 없이 이어붙여
 *   "영업 중20:00에 라스트오더20시 0분에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다. :)"
 * 같은 깨진 문자열이 나오고, 이게 프롬프트에 그대로 박혀 블로그 본문을 망친다.
 * 크롤 시점(신규)·읽기 시점(기존 저장분) 양쪽에서 부른다.
 */
export function normalizeHours(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let s = raw.replace(/\s+/g, ' ').trim();
  // 1) 세그먼트가 붙은 한글→숫자 경계에만 공백 ("중20:00"→"중 20:00", "라스트오더20시"→"라스트오더 20시").
  //    숫자→한글 방향은 건드리지 않음 — "20:00에"·"8시"·"24시간" 같은 정상 표현이 깨짐.
  s = s.replace(/([가-힣])(\d)/g, '$1 $2');
  // 2) 크롤 시각에 따라 바뀌는 실시간 상태 접두사 제거(에버그린 콘텐츠엔 부적합)
  s = s.replace(/^(영업\s*중|영업\s*종료|곧\s*영업\s*(종료|시작)|브레이크\s*타임|영업\s*전)\s*/g, '');
  // 3) 같은 라스트오더 정보가 두 포맷으로 중복되는 네이버 패턴 → 첫 것만
  //    "20:00에 라스트오더 20시 0분에 라스트오더 - X" → "20:00에 라스트오더 - X"
  s = s.replace(/(\d{1,2}\s*:\s*\d{2}에\s*라스트오더)\s*\d{1,2}\s*시\s*\d{1,2}\s*분에\s*라스트오더/g, '$1');
  // 4) 이모티콘·꼬리 정리
  s = s.replace(/[:;]-?[)(]+/g, '').replace(/\s*-\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return s || undefined;
}

/**
 * 찾아가는길 정제 — 네이버 미리보기의 잘림 표시("...")를 떼어
 * AI가 뒤 문장을 이어 붙여 "건물사계절…"처럼 깨지는 걸 막는다.
 */
export function cleanDirections(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\s+/g, ' ').replace(/\s*(\.{2,}|…)\s*$/, '').trim();
  return s || undefined;
}

/**
 * stores.brand_tone.place_facts(크롤 저장분) → DraftInput.place 변환.
 * placeFactSection이 이 값을 프롬프트에 박아 메뉴·가격·영업시간을 지어내지 않는 글을 만든다.
 * (crawl-place.ts가 저장, 여기는 순수 변환 — playwright 의존 없음이라 web에서도 안전)
 */
export function placeFromBrandTone(tone: BrandTone | Record<string, unknown> | null | undefined): PlaceInfo | undefined {
  const pf = (tone as Record<string, unknown> | null | undefined)?.place_facts as
    | {
        name?: string;
        address?: string;
        phone?: string | null;
        hours?: string | null;
        categories?: string[];
        descriptionRaw?: string | null;
        menu?: { name: string; price?: number }[];
      }
    | undefined;
  if (!pf || !pf.name) return undefined;
  return {
    name: pf.name,
    address: pf.address ?? '',
    phone: pf.phone ?? undefined,
    // 읽기 시점 정제: 기존에 깨진 채 저장된 값도 여기서 걸러진다(재크롤 없이도 개선)
    hours: normalizeHours(pf.hours),
    categories: pf.categories ?? [],
    descriptionRaw: cleanDirections(pf.descriptionRaw),
    menu: pf.menu ?? [],
  };
}
