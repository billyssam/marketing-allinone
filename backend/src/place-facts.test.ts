/**
 * 영업시간·찾아가는길 정제 회귀 테스트 (무의존 · Node 내장 test).
 * 실행: npx tsx --test src/place-facts.test.ts
 * 배경: 쿵더쿵 place_facts.hours가 깨진 채 저장돼 블로그 본문을 망쳤음(2026-07-20 발견).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHours, cleanDirections, placeFromBrandTone } from '../../shared/content-engine/place-facts.js';

test('영업시간: 쿵더쿵 실제 깨진 문자열 정제', () => {
  const raw = '영업 중20:00에 라스트오더20시 0분에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다. :)';
  const out = normalizeHours(raw);
  // 상태 접두사·중복 라스트오더·이모티콘 제거, 붙은 공백 복원
  assert.equal(out, '20:00에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다.');
  assert.ok(!out!.includes('영업 중'), '실시간 상태 접두사 제거');
  assert.ok(!out!.includes(':)'), '이모티콘 제거');
  assert.ok(!/라스트오더.*라스트오더/.test(out!), '라스트오더 중복 제거');
});

test('영업시간: 정상 문자열은 손대지 않음', () => {
  assert.equal(normalizeHours('매일 10:00 - 22:00'), '매일 10:00 - 22:00');
  assert.equal(normalizeHours('연중무휴 24시간'), '연중무휴 24시간');
});

test('영업시간: 붙어버린 한글↔숫자 공백 복원', () => {
  assert.equal(normalizeHours('평일10:00~22:00'), '평일 10:00~22:00');
});

test('영업시간: 빈 값 방어', () => {
  assert.equal(normalizeHours(undefined), undefined);
  assert.equal(normalizeHours(null), undefined);
  assert.equal(normalizeHours('   '), undefined);
});

test('찾아가는길: 네이버 미리보기 잘림 표시 제거', () => {
  assert.equal(cleanDirections('현리교차로 현리사거리 버스정류장 뒤 건물 ...'), '현리교차로 현리사거리 버스정류장 뒤 건물');
  assert.equal(cleanDirections('버스정류장 뒤 건물…'), '버스정류장 뒤 건물');
  assert.equal(cleanDirections(undefined), undefined);
});

test('placeFromBrandTone: 저장된 깨진 hours가 읽기 시점에 정제됨', () => {
  const tone = {
    place_facts: {
      name: '쿵더쿵 카페',
      address: '충북 옥천군 안내면 현리3길 16 쿵더쿵',
      hours: '영업 중20:00에 라스트오더20시 0분에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다. :)',
      descriptionRaw: '현리교차로 현리사거리 버스정류장 뒤 건물 ...',
      menu: [{ name: '수제대추차', price: 5800 }],
    },
  };
  const place = placeFromBrandTone(tone);
  assert.equal(place?.hours, '20:00에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다.');
  assert.equal(place?.descriptionRaw, '현리교차로 현리사거리 버스정류장 뒤 건물');
});
