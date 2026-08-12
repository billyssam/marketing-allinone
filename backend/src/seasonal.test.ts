/**
 * 시점(계절·시의성) 컨텍스트 회귀 테스트.
 * 실행: npx tsx --test src/seasonal.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonalContext } from '../../shared/content-engine/seasonal.js';

const kst = (iso: string) => Date.parse(iso);

test('월 → 계절 매핑', () => {
  assert.equal(seasonalContext(kst('2026-01-15T12:00:00+09:00')).season, '겨울');
  assert.equal(seasonalContext(kst('2026-04-15T12:00:00+09:00')).season, '봄');
  assert.equal(seasonalContext(kst('2026-07-15T12:00:00+09:00')).season, '여름');
  assert.equal(seasonalContext(kst('2026-10-15T12:00:00+09:00')).season, '가을');
  assert.equal(seasonalContext(kst('2026-12-15T12:00:00+09:00')).season, '겨울');
});

test('근접 이벤트(±5일) 감지', () => {
  assert.equal(seasonalContext(kst('2026-12-24T10:00:00+09:00')).occasion, '크리스마스');
  assert.equal(seasonalContext(kst('2026-02-13T10:00:00+09:00')).occasion, '발렌타인데이');
  assert.equal(seasonalContext(kst('2026-05-05T10:00:00+09:00')).occasion, '어린이날');
});

test('이벤트 없는 날은 occasion 없음', () => {
  assert.equal(seasonalContext(kst('2026-07-20T10:00:00+09:00')).occasion, undefined);
});

test('hint 문자열이 계절을 담고, 이벤트 있으면 언급', () => {
  const xmas = seasonalContext(kst('2026-12-24T10:00:00+09:00'));
  assert.ok(xmas.hint.includes('겨울'));
  assert.ok(xmas.hint.includes('크리스마스'));

  const plain = seasonalContext(kst('2026-07-20T10:00:00+09:00'));
  assert.ok(plain.hint.includes('여름'));
  assert.ok(!/곧 /.test(plain.hint), '이벤트 없으면 "곧 X" 없음');
});

/**
 * 아래 세 테스트는 실측으로 드러난 결함을 못박는다(2026-08-12).
 * 기존 테스트는 절기가 **하나만 걸리는 날짜**만 봤기 때문에, 겹치는 날·지나간 날·해 넘김을
 * 한 번도 통과하지 않았다. "남은 것"이 아니라 "안 세어본 것"을 찾아야 나오는 종류다.
 */

test('겹치는 절기는 가장 가까운 것 — 5월(가정의 달)', () => {
  // 첫 매칭에서 끊으면 목록이 연대순이라 어린이날이 늘 이겼다
  assert.equal(seasonalContext(kst('2026-05-08T10:00:00+09:00')).occasion, '어버이날');
  assert.equal(seasonalContext(kst('2026-05-03T10:00:00+09:00')).occasion, '어린이날');
  assert.equal(seasonalContext(kst('2026-05-06T10:00:00+09:00')).occasion, '어버이날', '지나간 어린이날을 잡으면 안 된다');
  assert.equal(seasonalContext(kst('2026-05-13T10:00:00+09:00')).occasion, '스승의날');
});

test("지나간 절기는 잡지 않는다 — 문구가 '곧'이다", () => {
  assert.equal(seasonalContext(kst('2026-12-26T10:00:00+09:00')).occasion, '연말·송년');
  assert.equal(seasonalContext(kst('2026-12-30T10:00:00+09:00')).occasion, '연말·송년');
  assert.equal(seasonalContext(kst('2026-02-16T10:00:00+09:00')).occasion, undefined, '발렌타인 지난 뒤');
});

test('해를 넘어가는 근접(12월 말 → 새해)', () => {
  // 같은 해 절댓값으로 재면 361일로 나와 연초가 통째로 죽었다
  assert.equal(seasonalContext(kst('2026-12-28T10:00:00+09:00')).occasion, '연말·송년');
  assert.equal(seasonalContext(kst('2027-01-01T10:00:00+09:00')).occasion, '새해');
  assert.equal(seasonalContext(kst('2026-12-27T23:30:00+09:00')).occasion, '연말·송년');
});

test('윤년에도 경계가 밀리지 않는다(2028)', () => {
  // 2/29가 끼어 3/1까지 실제 6일인 날. 누적일수 표로 재면 5일로 나와 창 안에 잘못 들어온다
  assert.equal(seasonalContext(kst('2028-02-24T10:00:00+09:00')).occasion, undefined);
  assert.equal(seasonalContext(kst('2028-02-25T10:00:00+09:00')).occasion, '새 학기', '실제 5일 — 창 안');
  assert.equal(seasonalContext(kst('2028-02-29T10:00:00+09:00')).occasion, '새 학기', '하루 뒤가 3/1');
  assert.equal(seasonalContext(kst('2028-03-14T10:00:00+09:00')).occasion, '화이트데이');
});

test('음력 명절은 넣지 않음(오판 방지) — occasion 목록에 설/추석 없음', () => {
  // 어떤 날짜든 occasion이 설날/추석이 되지 않아야
  for (let m = 1; m <= 12; m++) {
    for (const d of [1, 10, 20, 28]) {
      const iso = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T10:00:00+09:00`;
      const oc = seasonalContext(kst(iso)).occasion ?? '';
      assert.ok(!/설날|추석|명절/.test(oc));
    }
  }
});
