/**
 * 대시보드 넛지 선택 회귀 테스트.
 * 실행: npx tsx --test src/nudge.test.ts
 *
 * 핵심은 **범용성**이다: 43업종 중 어느 하나도 "사실이 0인데 아무 안내도 못 받는" 상태가
 * 되면 안 되고, 플레이스가 없는 게 정상인 업종에 플레이스를 조르면 안 된다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNudge } from '../../shared/nudge.js';
import { BUSINESS_TYPES, hasPlacePage } from '../../shared/business/taxonomy.js';

test('플레이스 있을 만한 업종 · 미연결 → 플레이스부터(입력 0회로 사실이 따라온다)', () => {
  assert.equal(pickNudge({ hasPlaceUrl: false, offeringCount: 0, canHavePlace: true }), 'place');
  assert.equal(pickNudge({ hasPlaceUrl: false, offeringCount: 5, canHavePlace: true }), 'place');
});

test('둘 다 비어도 넛지는 하나만 — 주황이 두 개면 무엇부터인지 모른다', () => {
  assert.equal(pickNudge({ hasPlaceUrl: false, offeringCount: 0, canHavePlace: true }), 'place');
});

test('플레이스는 붙였는데 항목이 0 → 판매 항목으로 이어받는다(가격표 탭 없는 업종)', () => {
  assert.equal(pickNudge({ hasPlaceUrl: true, offeringCount: 0, canHavePlace: true }), 'offering');
});

test('범용성: 플레이스가 없는 게 정상인 업종은 조르지 않고 판매 항목을 안내한다', () => {
  assert.equal(pickNudge({ hasPlaceUrl: false, offeringCount: 0, canHavePlace: false }), 'offering');
  assert.equal(pickNudge({ hasPlaceUrl: false, offeringCount: 3, canHavePlace: false }), null);
});

test('다 채운 매장에는 넛지가 없다', () => {
  assert.equal(pickNudge({ hasPlaceUrl: true, offeringCount: 3, canHavePlace: true }), null);
});

test('43업종 전수: 사실이 0이면 어느 업종이든 반드시 안내를 받는다', () => {
  const silent: string[] = [];
  for (const bt of BUSINESS_TYPES) {
    const n = pickNudge({ hasPlaceUrl: false, offeringCount: 0, canHavePlace: hasPlacePage(bt) });
    if (n === null) silent.push(bt.id);
  }
  assert.deepEqual(silent, [], `안내를 못 받는 업종: ${silent.join(', ')}`);
});

/**
 * saleModes로 판단하던 시절 이 목록이 32곳이나 조용했다.
 * saleModes는 '어떻게 파는가'라서 미용실·헬스장·병원은 offline이 false다.
 */
test('찾아오는 매장이 있는 업종은 플레이스 안내를 받는다(과거 32곳이 조용했던 자리)', () => {
  for (const id of ['hair', 'gym', 'clinic', 'dental', 'academy', 'pension', 'studycafe', 'class_studio', 'vet', 'nail']) {
    const bt = BUSINESS_TYPES.find((b) => b.id === id);
    assert.ok(bt, `${id} 업종 존재`);
    assert.equal(
      pickNudge({ hasPlaceUrl: false, offeringCount: 0, canHavePlace: hasPlacePage(bt!) }),
      'place',
      `${id}(${bt!.label})는 플레이스 안내를 받아야 한다`,
    );
  }
});

test('플레이스가 없는 게 정상인 업종에는 플레이스를 조르지 않는다', () => {
  for (const id of ['online_seller', 'freelancer', 'tutoring']) {
    const bt = BUSINESS_TYPES.find((b) => b.id === id);
    assert.ok(bt, `${id} 업종 존재`);
    assert.equal(hasPlacePage(bt!), false, `${id}는 플레이스 없음으로 분류`);
    assert.equal(
      pickNudge({ hasPlaceUrl: false, offeringCount: 0, canHavePlace: false }),
      'offering',
      `${id}는 판매 항목 안내를 받아야 한다`,
    );
  }
});
