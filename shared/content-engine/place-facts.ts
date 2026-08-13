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
  // 3) 같은 정보가 두 포맷으로 중복되는 네이버 패턴 → 첫 것만.
  //    "20:00에 라스트오더 20시 0분에 라스트오더" · "21:00에 영업 종료 21시 0분에 영업 종료"
  //    (라스트오더만 잡다가 '영업 종료' 중복이 그대로 나갔다 — 2026-08-13 실측)
  s = s.replace(
    /(\d{1,2}\s*:\s*\d{2}에\s*(라스트오더|영업\s*종료|영업\s*시작))\s*\d{1,2}\s*시\s*\d{1,2}\s*분에\s*\2/g,
    '$1',
  );
  // 4) 네이버 **상태 문구**를 글에 쓸 수 있는 표현으로.
  //    크롤값 "21:00에 영업 종료"는 지금 상태를 알리는 말이지 영업시간 표기가 아니다.
  //    그대로 넣으니 "영업시간: 21시 0분에 영업 종료"(인스타·플레이스),
  //    "영업시간은 21시 0분에 영업 종료합니다"(구글)처럼 문장이 깨졌다 — 2026-08-13 실측 3채널.
  s = s
    .replace(/(\d{1,2}\s*:\s*\d{2})\s*에\s*영업\s*종료/g, '$1까지 영업')
    .replace(/(\d{1,2}\s*:\s*\d{2})\s*에\s*영업\s*시작/g, '$1 영업 시작');
  // 5) 이모티콘·꼬리 정리
  s = s.replace(/[:;]-?[)(]+/g, '').replace(/\s*-\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return s || undefined;
}

const SEASON_CLAUSES: { re: RegExp; season: '겨울' | '여름' }[] = [
  { re: /동절기|겨울\s*철?|겨울에는/, season: '겨울' },
  { re: /하절기|여름\s*철?|여름에는/, season: '여름' },
];

/**
 * 지금 계절에 맞지 않는 조건절을 떼어낸다. **읽는 시점에만** 부른다 —
 * 저장분에는 원문을 남겨야 겨울이 오면 겨울 안내가 다시 살아난다.
 *
 * 왜(실측 2026-08-13): 쿵더쿵 영업시간이
 *   "20:00에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다."
 * 인데, 프롬프트가 이걸 "**정확한** 영업시간"으로 넘기니 모델이 시킨 대로 따랐다.
 * 8월 13일 글 4개 채널에 "동절기에는 저녁 8시까지 영업하며"가 나갔고
 * 카카오는 "오늘 저녁 8시 라스트오더"라고 **오늘 시간으로 단정**했다.
 * 여름 영업시간이 다르면 손님에게 틀린 정보가 나가고, 사장님 신뢰는 한 번에 깨진다.
 *
 * 조건절을 떼고 남는 게 없으면 undefined — 모르는 영업시간은 **말하지 않는 게 맞다**
 * (프롬프트 절대규칙 2: 값이 비면 본문에서 아예 언급하지 않는다).
 */
export function hoursForNow(hours?: string | null, nowMs: number = Date.now()): string | undefined {
  if (!hours) return undefined;
  const month = new Date(nowMs + 9 * 3_600_000).getUTCMonth() + 1; // KST 기준 월
  const season = month === 12 || month <= 2 ? '겨울' : month >= 6 && month <= 8 ? '여름' : null;
  const parts = hours.split(/\s*[-–—]\s+|\.\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    // 조건절이 따로 없다 — 통째로 계절 조건이면 지금 계절이 아닐 때 말하지 않는다
    const only = SEASON_CLAUSES.find((c) => c.re.test(hours));
    return only && only.season !== season ? undefined : hours;
  }
  const kept = parts.filter((p) => {
    const hit = SEASON_CLAUSES.find((c) => c.re.test(p));
    return hit ? hit.season === season : true;
  });
  if (!kept.length) return undefined;
  return kept.length === parts.length ? hours : kept.join(' - ');
}

/**
 * 전화번호 정제 — 네이버가 안내 배지 텍스트를 번호에 붙여 뱉는다.
 * 실측: "0507-1318-0645안내" → 블로그 안내 블록에 그대로 실렸다.
 */
export function normalizePhone(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const m = String(raw).replace(/\s+/g, ' ').match(/\+?\d[\d\s\-().]{6,}\d/);
  if (!m) return undefined;
  const s = m[0].replace(/[()\s.]/g, '').replace(/-+$/, '').trim();
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
export function placeFromBrandTone(
  tone: BrandTone | Record<string, unknown> | null | undefined,
  /** 계절 조건 판정 기준 시각. 테스트에서 고정하려고 주입한다(안 주면 지금). */
  nowMs: number = Date.now(),
): PlaceInfo | undefined {
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
    // 읽기 시점 정제: 기존에 깨진 채 저장된 값도 여기서 걸러진다(재크롤 없이도 개선).
    // 계절 조건은 '지금'을 봐야 하므로 저장 시점이 아니라 **읽는 시점**에 판정한다.
    phone: normalizePhone(pf.phone),
    hours: hoursForNow(normalizeHours(pf.hours), nowMs),
    categories: pf.categories ?? [],
    descriptionRaw: cleanDirections(pf.descriptionRaw),
    menu: pf.menu ?? [],
  };
}
