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
