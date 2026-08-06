/**
 * 리뷰 총 개수 파싱 회귀 테스트.
 * 실행: npx tsx --test src/place-count.test.ts
 *
 * 이 값이 틀리면 사장님에게 "리뷰가 늘었다/줄었다"고 거짓말하게 된다.
 * 특히 축약 표기("1.5만")를 정확한 값처럼 다루면 실제로 몇백 건이 늘어도 0으로 보인다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewCount } from '../../shared/content-engine/place-crawler.js';

test('정확한 숫자는 그대로', () => {
  assert.deepEqual(parseReviewCount('280'), { count: 280, exact: true });
  assert.deepEqual(parseReviewCount('2,103'), { count: 2103, exact: true });
  assert.deepEqual(parseReviewCount(' 15 '), { count: 15, exact: true });
});

test('축약 표기는 근사값으로 표시한다(추이 계산에서 빼야 한다)', () => {
  assert.deepEqual(parseReviewCount('1.5만'), { count: 15000, exact: false });
  assert.deepEqual(parseReviewCount('3천'), { count: 3000, exact: false });
  assert.deepEqual(parseReviewCount('2만'), { count: 20000, exact: false });
});

test('알 수 없는 형태는 버린다(추측하지 않는다)', () => {
  for (const s of ['', '   ', '많음', '1.5', '12개', 'abc']) {
    const r = parseReviewCount(s);
    assert.ok(r === undefined, `${JSON.stringify(s)} → ${JSON.stringify(r)}`);
  }
});
