/**
 * 깨진 Gemini JSON에서 **글을 건져낸다**.
 *
 * 왜 필요한가 (2026-08-27·09-02 실측):
 * `responseMimeType: 'application/json'`을 줘도 본문 한가운데에 **이스케이프 안 된 `"`**가
 * 섞여 나온다. 그러면 문자열이 조기에 끝나고 `JSON.parse`가 통째로 실패한다.
 *   `Expected ',' or '}' after property value in JSON at position 3434 (line 3 column 3392)`
 * 지금까지의 대응은 "본문 1회 재생성"뿐이었는데, 재생성도 같은 방식으로 깨지면
 * **그 매장은 그날 글이 0건**이 된다. 실제로 8/27 데일리가 그렇게 죽었고,
 * 9/2 여정 검증에서는 **가입 첫날 사장님이 빈 화면**을 봤다.
 *
 * 스키마의 필수는 `title`·`bodyHtml` 둘뿐이고 나머지(tags 등)는 호출부에서 정규화된다.
 * 그러니 깨진 원문에서도 그 둘만 건지면 사장님은 글을 받는다 —
 * **완전 실패를 부분 성공으로 바꾸는 것**이 이 파일의 전부다.
 *
 * ⚠️ 이건 재생성을 대체하지 않는다. 정상 파싱 → 재생성 → 그래도 안 되면 건지기 순서다.
 */

/** 본문 뒤에 올 수 있는 형제 키들 — 본문의 끝을 여기서 찾는다 */
const SIBLING_KEYS = ['tags', 'suggestedPhotoOrder', 'qualityNotes', 'summary', 'title'];

/** JSON 문자열 이스케이프를 실제 문자로 되돌린다(부분 문자열이라 JSON.parse를 못 쓴다) */
function unescape(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, '\\');
}

/**
 * `"<key>"\s*:\s*"` 의 값 시작 위치를 찾는다. 없으면 -1.
 */
function valueStart(raw: string, key: string): number {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  return m ? m.index + m[0].length : -1;
}

/**
 * 값의 끝을 찾는다 — **뒤에서부터**.
 * 이스케이프 안 된 따옴표가 값 안에 있으므로 "첫 따옴표"를 믿으면 본문이 잘린다.
 * 대신 "다음 형제 키가 시작되는 자리" 또는 "객체가 닫히는 자리" 직전의 따옴표를 끝으로 본다.
 */
function valueEnd(raw: string, from: number): number {
  let end = -1;
  for (const k of SIBLING_KEYS) {
    const m = new RegExp(`"\\s*,\\s*"${k}"\\s*:`).exec(raw.slice(from));
    if (m && (end === -1 || m.index < end)) end = m.index;
  }
  if (end !== -1) return from + end;

  // 형제 키가 없으면 객체를 닫는 마지막 `"` 를 끝으로
  const tail = raw.slice(from);
  const close = tail.lastIndexOf('"');
  if (close !== -1) return from + close;

  // 절단이라 닫는 따옴표조차 없다 → 남은 전부가 본문이다
  return raw.length;
}

export interface Salvaged {
  title: string;
  bodyHtml: string;
  /** 어떻게 건졌는지 — 로그·경보용 */
  how: 'truncated' | 'unescaped-quote';
}

/**
 * 깨진 JSON에서 title·bodyHtml을 건진다. 둘 중 하나라도 못 건지면 null.
 * (건진 글은 정상 생성분보다 못할 수 있으므로 호출부가 반드시 표시·기록할 것)
 */
export function salvageDraftJson(raw: string): Salvaged | null {
  if (!raw) return null;

  const tStart = valueStart(raw, 'title');
  const bStart = valueStart(raw, 'bodyHtml');
  if (tStart === -1 || bStart === -1) return null;

  // 제목은 짧아 깨질 일이 드물다 — 첫 이스케이프 안 된 따옴표까지
  const tRest = raw.slice(tStart);
  const tm = /(?:[^"\\]|\\.)*/.exec(tRest);
  const title = unescape(tm ? tm[0] : '').trim();

  const bodyHtml = unescape(raw.slice(bStart, valueEnd(raw, bStart))).trim();

  if (!title || bodyHtml.length < 50) return null;

  // 닫는 따옴표를 못 찾았으면 응답이 잘린 것이다
  const how: Salvaged['how'] = raw.trimEnd().endsWith('}') ? 'unescaped-quote' : 'truncated';
  return { title: title.slice(0, 120), bodyHtml, how };
}
