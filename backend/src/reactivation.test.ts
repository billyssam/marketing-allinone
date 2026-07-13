/**
 * 재방문 유도 로직 회귀 테스트 (무의존 · Node 내장 test).
 * 실행: npx tsx --test src/reactivation.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierByDays,
  isReactivationTarget,
  daysSince,
  draftReactivation,
} from '../../shared/content-engine/reactivation.js';

test('등급: 경과일 구간별 분류', () => {
  assert.equal(tierByDays(5), 'active');
  assert.equal(tierByDays(30), 'active');
  assert.equal(tierByDays(45), 'fading');
  assert.equal(tierByDays(90), 'inactive');
  assert.equal(tierByDays(null), 'unknown');
});

test('유도 대상: 30일 초과 or 방문일 미상만', () => {
  assert.equal(isReactivationTarget(10), false); // active
  assert.equal(isReactivationTarget(45), true); // fading
  assert.equal(isReactivationTarget(200), true); // inactive
  assert.equal(isReactivationTarget(null), true); // unknown
});

test('daysSince: ISO → 경과일', () => {
  const now = Date.parse('2026-07-13T00:00:00+09:00');
  assert.equal(daysSince('2026-07-13T00:00:00+09:00', now), 0);
  assert.equal(daysSince('2026-07-03T00:00:00+09:00', now), 10);
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince('garbage', now), null);
});

test('메시지: 이름·상호 포함, 이모지 없음', () => {
  const m = draftReactivation({ name: '홍길동', storeName: '쿵더쿵', daysSince: 90 });
  assert.match(m, /홍길동님/);
  assert.match(m, /쿵더쿵/);
  assert.doesNotMatch(m, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, '이모지 없어야');
});

test('메시지: 혜택 문구 반영', () => {
  const withBenefit = draftReactivation({ name: '김철수', storeName: '쿵더쿵', daysSince: 100, benefit: '아메리카노 1잔 무료' });
  assert.match(withBenefit, /아메리카노 1잔 무료/);
});

test('메시지: 결정적(같은 입력 = 같은 출력)', () => {
  const a = draftReactivation({ name: '이영희', storeName: '쿵더쿵', daysSince: 70 });
  const b = draftReactivation({ name: '이영희', storeName: '쿵더쿵', daysSince: 70 });
  assert.equal(a, b);
});

test('메시지: 이름 없으면 고객님', () => {
  const m = draftReactivation({ name: null, storeName: '쿵더쿵', daysSince: 90 });
  assert.match(m, /고객님/);
});
