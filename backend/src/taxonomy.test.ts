/**
 * 사업 택소노미 회귀 테스트 (무의존 · Node 내장 test).
 * 실행: npx tsx --test src/taxonomy.test.ts
 * 핵심: 어떤 업종이든 크래시 없이 프리셋·추천채널이 나와야 한다(범용성).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_TYPES,
  getBusinessType,
  resolveBusinessType,
  recommendedChannelsFor,
  businessTypesByGroup,
} from '../../shared/business/taxonomy.js';
import { getIndustryPrompt } from '../../shared/content-engine/registry.js';

test('택소노미: id 유일성 + 필수 필드', () => {
  const ids = BUSINESS_TYPES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'id 중복 없음');
  for (const b of BUSINESS_TYPES) {
    assert.ok(b.label && b.group && b.offering && b.preset, `${b.id} 필드 완비`);
    assert.ok(b.saleModes.length > 0, `${b.id} 판매형태 있음`);
  }
});

test('resolveBusinessType: 알 수 없는 업종도 안전 폴백(크래시 금지)', () => {
  assert.equal(resolveBusinessType('cafe').id, 'cafe');
  assert.equal(getBusinessType('없는업종'), undefined);
  const fb = resolveBusinessType('없는업종');
  assert.equal(fb.preset, 'service', '폴백은 service 프리셋');
  assert.ok(fb.saleModes.length > 0);
});

test('getIndustryPrompt: 모든 업종 + 미지 업종에서 절대 throw 안 함', () => {
  for (const b of BUSINESS_TYPES) {
    assert.doesNotThrow(() => getIndustryPrompt(b.id), `${b.id} 프롬프트 OK`);
    const p = getIndustryPrompt(b.id);
    assert.ok(p.systemPrompt.length > 0);
    assert.equal(typeof p.planningTemplate, 'function');
    assert.equal(typeof p.writingTemplate, 'function');
  }
  // 예전에 크래시 나던 케이스들
  assert.doesNotThrow(() => getIndustryPrompt('beauty'));
  assert.doesNotThrow(() => getIndustryPrompt('hair'));
  assert.doesNotThrow(() => getIndustryPrompt('완전_모르는_업종'));
});

test('추천채널: 판매형태에 따라 달라진다(적응)', () => {
  const cafe = recommendedChannelsFor(resolveBusinessType('cafe'));
  const restaurant = recommendedChannelsFor(resolveBusinessType('restaurant'));
  const seller = recommendedChannelsFor(resolveBusinessType('online_seller'));

  // 공통 baseline
  for (const c of [cafe, restaurant, seller]) {
    assert.ok(c.includes('naver_place') && c.includes('instagram'), '유입 baseline');
    assert.ok(c.includes('kakao_alimtalk'), '재방문 공통');
  }
  // 배달 업종만 배민
  assert.ok(restaurant.includes('baemin'), '음식점=배달→배민');
  assert.ok(!cafe.includes('baemin'), '카페=매장→배민 아님');
  // 온라인 셀러만 스마트스토어
  assert.ok(seller.includes('smartstore'), '온라인셀러→스마트스토어');
  assert.ok(!cafe.includes('smartstore'), '카페→스마트스토어 아님');
});

test('그룹핑: 9개 그룹 모두 최소 1개 업종', () => {
  for (const g of ['food', 'retail', 'beauty', 'health', 'medical', 'education', 'lifestyle', 'professional', 'hospitality'] as const) {
    assert.ok(businessTypesByGroup(g).length > 0, `${g} 그룹 비어있지 않음`);
  }
});
