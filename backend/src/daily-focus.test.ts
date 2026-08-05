/**
 * 오늘의 우선순위 회귀 테스트.
 * 실행: npx tsx --test src/daily-focus.test.ts
 *
 * 이 로직이 틀리면 사장님이 엉뚱한 걸 먼저 하게 된다 — 추천은 근거가 맞아야 따른다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDailyFocus, type FocusCandidate } from '../../shared/content-engine/daily-focus.js';

const NOW = Date.parse('2026-08-05T03:00:00Z');
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const c = (channel: string, lastPublishedAt?: string | null): FocusCandidate =>
  ({ postId: `p-${channel}`, channel, lastPublishedAt } as FocusCandidate);

test('한 번도 안 올린 채널이 가장 앞에 온다', () => {
  const r = pickDailyFocus([c('threads', ago(1)), c('naver_place', null), c('facebook', ago(2))], NOW);
  assert.equal(r.primary?.channel, 'naver_place');
  assert.match(r.primary!.reason, /한 번도/);
});

test('같은 조건이면 채널 효과 순서를 따른다(레지스트리 priority 단일 원천)', () => {
  // 전부 어제 발행 → 방치 보너스 동일 → priority가 낮은(=효과 큰) 채널이 앞
  const r = pickDailyFocus([c('facebook', ago(1)), c('naver_place', ago(1)), c('threads', ago(1))], NOW);
  assert.equal(r.primary?.channel, 'naver_place'); // priority 1 → weight 19
  assert.equal(r.secondary?.channel, 'threads'); // threads priority 16(weight 4) > facebook 17(weight 3)
});

test('오래 방치된 채널은 효과가 낮아도 결국 앞으로 올라온다', () => {
  // 효과 큰 채널만 매일 1순위가 되면 나머지는 영원히 방치된다 → 로테이션이 일어나야 한다.
  // 플레이스(어제 발행) vs 스레드(12일째) → 방치가 이긴다
  const r = pickDailyFocus([c('naver_place', ago(1)), c('threads', ago(12))], NOW);
  assert.equal(r.primary?.channel, 'threads');
  assert.match(r.primary!.reason, /12일째/);
  // 반대로 며칠 안 된 방치는 효과 큰 채널을 못 이긴다(아무거나 올라오면 추천이 무의미)
  const r2 = pickDailyFocus([c('naver_place', ago(1)), c('threads', ago(3))], NOW);
  assert.equal(r2.primary?.channel, 'naver_place');
});

test('나머지를 버리지 않고 rest로 전부 넘긴다', () => {
  const items = ['naver_blog', 'naver_place', 'instagram', 'facebook', 'threads', 'danggeun'].map((ch) => c(ch, ago(1)));
  const r = pickDailyFocus(items, NOW);
  assert.equal(1 + 1 + r.rest.length, items.length, '하나도 사라지면 안 된다');
  assert.ok(r.rest.every((x) => x.reason && x.effort), '나머지에도 이유·소요가 있어야');
});

test('블로그만 소요가 더 길게 표시된다(3단계라 실제로 오래 걸림)', () => {
  const r = pickDailyFocus([c('naver_blog', ago(1)), c('naver_place', ago(1))], NOW);
  const blog = [r.primary, r.secondary].find((x) => x?.channel === 'naver_blog');
  const place = [r.primary, r.secondary].find((x) => x?.channel === 'naver_place');
  assert.equal(blog?.effort, '1분');
  assert.equal(place?.effort, '30초');
});

test('업종을 가정하는 어휘를 쓰지 않는다', () => {
  const r = pickDailyFocus(['naver_place', 'instagram', 'danggeun', 'kakao_channel'].map((ch) => c(ch, ago(1))), NOW);
  const all = [r.primary, r.secondary, ...r.rest].map((x) => x!.reason).join(' ');
  assert.ok(!/메뉴|맛|음식|드시|커피/.test(all), `업종 가정 어휘 누출: ${all}`);
});

test('빈 입력에서 터지지 않는다', () => {
  const r = pickDailyFocus([], NOW);
  assert.equal(r.primary, undefined);
  assert.equal(r.rest.length, 0);
});
