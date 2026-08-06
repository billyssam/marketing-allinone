/**
 * 43업종 전수 정합성 회귀 테스트.
 * 실행: npx tsx --test src/industries.test.ts
 *
 * 범용성이 이 제품의 정체성인데 실제로 손으로 검증한 건 카페·미용실 두 곳뿐이다.
 * 나머지 41업종은 파일럿에서 처음 쓰이는데, 그때 어색한 글이 나가면 그 사장님은 바로 떠난다.
 * Gemini 호출 없이 프롬프트 문자열만 보면 전수로 확인할 수 있다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_TYPES, resolveBusinessType, marketingFocusFor } from '../../shared/business/taxonomy.js';
import { getIndustryPrompt } from '../../shared/content-engine/registry.js';
import { dailyDirective, titleStyleFor, titleDirective, anglesForOffering } from '../../shared/content-engine/angles.js';
import { offeringNoun, offeringLabel } from '../../shared/content-engine/offerings.js';
import { BASE_SYSTEM_PROMPT } from '../../shared/content-engine/prompts/base.js';
import type { DraftInput } from '../../shared/content-engine/types.js';

const NOW = Date.parse('2026-08-06T00:00:00Z');

/**
 * 음식 업종에만 있어야 할 어휘.
 * ⚠️ '드시'처럼 짧은 조각을 그냥 쓰면 "반**드시**"가 걸린다 — 실제로 한 번 오탐을 냈다.
 *    (감정사전에서 '다신'이 "해주십**니다신**장"에 걸린 것과 같은 유형)
 *    그래서 앞에 조사·어미가 붙지 않는 형태로만 검사한다.
 */
const FOOD_ONLY = /맛있|맛집|음식점|커피|음료|디저트|아메리카노|빙수|크로플|한 잔|드시고|드세요|드실/;

const inputFor = (industryId: string): DraftInput =>
  ({ store: { id: `s-${industryId}`, name: '가게이름', industryId, brandTone: {} }, photos: [] }) as unknown as DraftInput;

test('43업종 전부 프롬프트가 생성되고 필수 값이 채워진다', () => {
  assert.ok(BUSINESS_TYPES.length >= 40, `업종 ${BUSINESS_TYPES.length}종`);
  for (const bt of BUSINESS_TYPES) {
    assert.doesNotThrow(() => getIndustryPrompt(bt.id), `${bt.id} 프롬프트 throw`);
    assert.ok(offeringNoun(bt.offering), `${bt.id} 명사 없음`);
    assert.ok(offeringLabel(bt.offering), `${bt.id} 라벨 없음`);
    assert.ok(marketingFocusFor(bt), `${bt.id} 마케팅 포커스 없음`);
    assert.equal(resolveBusinessType(bt.id).id, bt.id, `${bt.id} 역해석 불일치`);
  }
});

test('비음식 업종 프롬프트에 음식 전용 어휘가 섞이지 않는다', () => {
  const bad: string[] = [];
  for (const bt of BUSINESS_TYPES) {
    if (bt.group === 'food') continue;
    const ip = getIndustryPrompt(bt.id);
    const text = [
      BASE_SYSTEM_PROMPT,
      ip.systemPrompt,
      ip.planningTemplate(inputFor(bt.id)),
      offeringLabel(bt.offering),
      offeringNoun(bt.offering),
    ].join('\n');
    const hits = [...new Set(text.match(new RegExp(FOOD_ONLY, 'g')) ?? [])];
    if (hits.length) bad.push(`${bt.id}: ${hits.join(',')}`);
  }
  assert.deepEqual(bad, [], `음식 어휘 누출\n${bad.join('\n')}`);
});

test('업종별 각도·제목 예시에 음식 어휘가 섞이지 않는다', () => {
  const bad: string[] = [];
  for (const offering of ['product', 'service', 'booking'] as const) {
    for (const a of anglesForOffering(offering)) {
      const hits = [...new Set(a.directive.match(new RegExp(FOOD_ONLY, 'g')) ?? [])];
      if (hits.length) bad.push(`각도 ${offering}/${a.key}: ${hits.join(',')}`);
    }
    for (let d = 0; d < 6; d++) {
      const style = titleStyleFor('probe', d);
      const hits = [...new Set(style.example[offering].match(new RegExp(FOOD_ONLY, 'g')) ?? [])];
      if (hits.length) bad.push(`제목 ${offering}/${style.key}: "${style.example[offering]}"`);
    }
  }
  assert.deepEqual(bad, [], `음식 어휘 누출\n${bad.join('\n')}`);
});

test('43업종 전부 오늘의 방향·제목 지시가 만들어진다(크래시 없음)', () => {
  for (const bt of BUSINESS_TYPES) {
    for (let d = 0; d < 6; d++) {
      assert.doesNotThrow(() => {
        const daily = dailyDirective(bt.offering, `s-${bt.id}`, NOW + d * 86_400_000, ['항목A', '항목B']);
        assert.ok(daily.directive.length > 20, `${bt.id} 방향 너무 짧음`);
        const t = titleDirective(titleStyleFor(`s-${bt.id}`, d), '가게이름', [], undefined, bt.offering);
        assert.ok(t.includes('제목 규칙'), `${bt.id} 제목 지시 없음`);
      }, `${bt.id} day${d}`);
    }
  }
});
