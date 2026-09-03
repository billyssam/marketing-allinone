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
  hasPlacePage,
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

  // 공통 baseline — 블로그·인스타·알림톡은 업종을 안 가린다
  for (const c of [cafe, restaurant, seller]) {
    assert.ok(c.includes('instagram'), '유입 baseline');
    assert.ok(c.includes('kakao_alimtalk'), '재방문 공통');
  }
  // ⚠️ 플레이스는 baseline이 아니다. 이 테스트는 예전에 `seller`까지 포함해
  // "셋 다 naver_place를 추천해야 한다"고 못 박고 있었다 — **틀린 단정을 테스트가 지키고 있었다.**
  // 온라인 셀러는 플레이스 페이지를 가질 수 없어서, 연결할 수 없는 채널이 대시보드에
  // "연결 대기"로 영영 남았다(2026-09-03 실사용자 계정에서 실측).
  assert.ok(cafe.includes('naver_place') && restaurant.includes('naver_place'), '오프라인 매장=플레이스');
  assert.ok(!seller.includes('naver_place'), '온라인 셀러=플레이스 없음');
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

/**
 * 플레이스를 못 가지는 업종에 플레이스 채널을 **추천하지 않는다.**
 *
 * 왜 이 테스트가 있나: 예전엔 "어떤 자영업이든 지역 검색은 기본"이라며 `naver_place`를
 * 무조건 추천했다. 그 결과 온라인 셀러 사장님 대시보드에 "네이버 플레이스 · 연결 대기"가
 * 영영 남았다 — **끝낼 수 없는 할 일**은 화면을 계속 갉아먹는다(2026-09-03 실사용자 계정에서 실측).
 */
test('범용성: 플레이스 없는 업종엔 naver_place를 추천하지 않는다', () => {
  let noPlaceCount = 0;
  for (const bt of BUSINESS_TYPES) {
    const rec = recommendedChannelsFor(bt);
    if (hasPlacePage(bt)) {
      assert.ok(rec.includes('naver_place'), `${bt.id}: 오프라인 업종인데 플레이스 추천이 빠졌다`);
    } else {
      noPlaceCount++;
      assert.ok(!rec.includes('naver_place'), `${bt.id}: 플레이스를 가질 수 없는데 추천됐다`);
    }
    // 어떤 업종이든 최소한 글을 올릴 곳은 있어야 한다 — 추천이 비면 온보딩이 빈 화면이 된다
    assert.ok(rec.length > 0, `${bt.id}: 추천 채널이 하나도 없다`);
  }
  // 있는 것만 세면 통째로 빠진 경우가 통과로 찍힌다 → 대상이 실제로 존재했는지 확인
  assert.ok(noPlaceCount >= 3, `플레이스 없는 업종이 ${noPlaceCount}개 — 분류가 사라졌는지 확인 필요`);
});
