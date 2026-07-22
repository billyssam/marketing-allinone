/**
 * 콘텐츠 각도 로테이션 회귀 테스트.
 * 실행: npx tsx --test src/angles.test.ts
 * 핵심: 연속된 날은 다른 각도(반복 방지) + 프롬프트에 실제로 각도가 들어간다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleFor, kstDayNumber, anglesForOffering, dailyDirective, weekPlan } from '../../shared/content-engine/angles.js';
import { getIndustryPrompt } from '../../shared/content-engine/registry.js';
import type { DraftInput } from '../../shared/content-engine/types.js';

test('연속된 날은 다른 각도(반복 방지)', () => {
  const store = 'store-abc';
  for (let d = 1000; d < 1010; d++) {
    const a = angleFor('menu', store, d);
    const b = angleFor('menu', store, d + 1);
    assert.notEqual(a.key, b.key, `day ${d}→${d + 1} 각도 달라야`);
  }
});

test('결정적 — 같은 (매장·날짜)는 같은 각도', () => {
  assert.equal(angleFor('service', 's1', 5000).key, angleFor('service', 's1', 5000).key);
});

test('매장별로 같은 날 각도가 갈린다(대부분)', () => {
  const day = 5000;
  const keys = ['a', 'b', 'c', 'd', 'e'].map((s) => angleFor('menu', `store-${s}`, day).key);
  assert.ok(new Set(keys).size >= 2, '매장 시드로 분산');
});

test('offering별 각도가 그 성격에 맞음', () => {
  assert.ok(anglesForOffering('menu').some((a) => a.key === 'signature'));
  assert.ok(anglesForOffering('product').some((a) => a.key === 'spotlight'));
  assert.ok(anglesForOffering('service').some((a) => a.key === 'result'));
  assert.ok(anglesForOffering('booking').some((a) => a.key === 'firstvisit'));
});

test('선택된 각도가 실제 planning 프롬프트에 들어간다(Gemini 없이)', () => {
  const angle = angleFor('menu', 'store-x', 5000);
  const input: DraftInput = {
    store: { id: 'store-x', name: '테스트카페', industryId: 'cafe', brandTone: {} },
    photos: [],
    targetLength: 'medium',
    angle: angle.directive,
  };
  const prompt = getIndustryPrompt('cafe').planningTemplate(input);
  assert.ok(prompt.includes(angle.directive), '각도 directive가 프롬프트에 포함');
});

test('dailyDirective: 중심 소재가 매일 로테이션(같은 메뉴 반복 방지)', () => {
  const menu = ['수제대추차', '눈꽃빙수', '쿵더쿵초콜릿', '플레인크로플'];
  const store = 'store-z';
  const base = Date.parse('2026-07-01T08:00:00+09:00');
  const DAY = 86_400_000;
  const feats = [0, 1, 2, 3].map((i) => dailyDirective('menu', store, base + i * DAY, menu).featured);
  // 연속 4일에 4개 메뉴가 겹치지 않고 다 나옴
  assert.equal(new Set(feats).size, 4, `소재 변주: ${feats.join(',')}`);
  // featured가 실제 메뉴 중 하나 + 지시문에 포함
  const one = dailyDirective('menu', store, base, menu);
  assert.ok(menu.includes(one.featured!));
  assert.ok(one.directive.includes(one.featured!));
});

test('dailyDirective: 소재 없으면 featured 없음(방어)', () => {
  const d = dailyDirective('service', 's', Date.parse('2026-07-01T08:00:00+09:00'), []);
  assert.equal(d.featured, undefined);
  assert.ok(d.directive.length > 0);
});

test('kstDayNumber는 하루 지나면 +1', () => {
  const base = Date.parse('2026-07-21T05:00:00+09:00');
  assert.equal(kstDayNumber(base + 86_400_000) - kstDayNumber(base), 1);
});

test('lengthForAngle: 각도 성격별 길이', () => {
  const base = Date.parse('2026-07-01T08:00:00+09:00'); const DAY=86_400_000;
  // 여러 날 돌려 long/short/medium 모두 등장하는지
  const lens = new Set();
  for (let i=0;i<10;i++) lens.add(dailyDirective('menu','store-len',base+i*DAY,[]).length);
  assert.ok(lens.has('long') && lens.has('short'), `길이 변주: ${[...lens].join(',')}`);
});

test('weekPlan: N일 계획이 매일 다른 각도(대부분)', () => {
  const base=Date.parse('2026-07-22T08:00:00+09:00');
  const plan=weekPlan('menu','store-wp',['A','B','C','D','E'],base,5);
  assert.equal(plan.length,5);
  assert.equal(plan[0].dayOffset,0);
  // 5일 각도가 최소 4종(사실상 매일 다름)
  assert.ok(new Set(plan.map(p=>p.angleLabel)).size>=4);
  // 중심소재도 변주
  assert.ok(new Set(plan.map(p=>p.featured)).size>=4);
});
