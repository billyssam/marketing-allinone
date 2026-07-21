/**
 * 판매 항목(offerings) 해석 회귀 테스트.
 * 실행: npx tsx --test src/offerings.test.ts
 * 핵심: 업종 무관하게 "이 사업이 파는 것"이 콘텐츠에 들어가야 한다(범용성).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOfferings, offeringLabel, formatOffering } from '../../shared/content-engine/offerings.js';

test('offerings: 사장님 관리분 우선', () => {
  const brandTone = { offerings: [{ name: '전신 왁싱', price: 80000, unit: '회' }] };
  const place = { name: 'x', address: '', categories: [], menu: [{ name: '커피', price: 4000 }] };
  const out = resolveOfferings(brandTone, place);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '전신 왁싱');
});

test('offerings: 관리분 없으면 크롤 메뉴로 폴백(카페)', () => {
  const out = resolveOfferings({}, { name: 'x', address: '', categories: [], menu: [{ name: '수제대추차', price: 5800 }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '수제대추차');
  assert.equal(out[0].price, 5800);
});

test('offerings: 둘 다 없으면 빈 배열(방어)', () => {
  assert.deepEqual(resolveOfferings(null, null), []);
  assert.deepEqual(resolveOfferings({}, { name: 'x', address: '', categories: [] }), []);
});

test('offerings: 빈 이름은 걸러냄', () => {
  const out = resolveOfferings({ offerings: [{ name: '  ' }, { name: '유효' }] }, null);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '유효');
});

test('offeringLabel: offering 종류별 라벨', () => {
  assert.equal(offeringLabel('menu'), '실제 메뉴·가격');
  assert.equal(offeringLabel('product'), '실제 상품·가격');
  assert.equal(offeringLabel('service'), '실제 서비스·시술');
  assert.equal(offeringLabel('booking'), '실제 프로그램·서비스');
});

test('formatOffering: 있는 값만 표기', () => {
  assert.equal(formatOffering({ name: '컷트', price: 20000 }), '컷트 (20,000원)');
  assert.equal(formatOffering({ name: 'PT', price: 50000, unit: '회' }), 'PT (50,000원/회)');
  assert.equal(formatOffering({ name: '상담', note: '30분 무료' }), '상담 — 30분 무료');
  assert.equal(formatOffering({ name: '단순' }), '단순');
});
