/**
 * 영업시간·찾아가는길 정제 회귀 테스트 (무의존 · Node 내장 test).
 * 실행: npx tsx --test src/place-facts.test.ts
 * 배경: 쿵더쿵 place_facts.hours가 깨진 채 저장돼 블로그 본문을 망쳤음(2026-07-20 발견).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHours,
  cleanDirections,
  placeFromBrandTone,
  hoursForNow,
  normalizePhone,
} from '../../shared/content-engine/place-facts.js';

const AUG = Date.parse('2026-08-13T03:00:00Z'); // KST 8/13 정오
const JAN = Date.parse('2027-01-13T03:00:00Z');
const APR = Date.parse('2026-04-13T03:00:00Z');

test('영업시간: 쿵더쿵 실제 깨진 문자열 정제', () => {
  const raw = '영업 중20:00에 라스트오더20시 0분에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다. :)';
  const out = normalizeHours(raw);
  // 상태 접두사·중복 라스트오더·이모티콘 제거, 붙은 공백 복원
  assert.equal(out, '20:00에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다.');
  assert.ok(!out!.includes('영업 중'), '실시간 상태 접두사 제거');
  assert.ok(!out!.includes(':)'), '이모티콘 제거');
  assert.ok(!/라스트오더.*라스트오더/.test(out!), '라스트오더 중복 제거');
});

test("영업시간: '영업 종료' 중복도 걷어낸다(스타일링룸 실측)", () => {
  // 라스트오더 중복만 잡고 있어서 이건 그대로 나갔다(2026-08-13)
  assert.equal(normalizeHours('21:00에 영업 종료 21시 0분에 영업 종료'), '21:00까지 영업');
  assert.equal(normalizeHours('09:00에 영업 시작 9시 0분에 영업 시작'), '09:00 영업 시작');
});

test('영업시간: 네이버 상태 문구를 글에 쓸 수 있는 표현으로 바꾼다', () => {
  // "21:00에 영업 종료"는 지금 상태를 알리는 말이라 문장에 넣으면 깨진다.
  // 실측: "영업시간: 21시 0분에 영업 종료" / "영업시간은 21시 0분에 영업 종료합니다"
  assert.equal(normalizeHours('21:00에 영업 종료'), '21:00까지 영업');
  assert.equal(normalizeHours('09:00에 영업 시작 - 21:00에 영업 종료'), '09:00 영업 시작 - 21:00까지 영업');
  // 라스트오더는 그대로 자연스럽다 — 건드리지 않는다
  assert.equal(normalizeHours('20:00에 라스트오더'), '20:00에 라스트오더');
  // 이미 자연스러운 표기는 손대지 않는다
  assert.equal(normalizeHours('매일 10:00 - 22:00'), '매일 10:00 - 22:00');
  assert.equal(normalizeHours('연중무휴 24시간'), '연중무휴 24시간');
});

test('전화번호: 안내 배지 텍스트가 번호에 붙어 나갔다(스타일링룸 실측)', () => {
  assert.equal(normalizePhone('0507-1318-0645안내'), '0507-1318-0645');
  assert.equal(normalizePhone('043-733-6616'), '043-733-6616');
  assert.equal(normalizePhone('전화 02-1234-5678 안내'), '02-1234-5678');
  assert.equal(normalizePhone(null), undefined);
  assert.equal(normalizePhone('번호없음'), undefined);
});

test('영업시간: 철 지난 계절 조건은 지금 말하지 않는다(8월에 동절기 안내가 나갔다)', () => {
  const raw = '20:00에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다.';
  // 8월 — 동절기 절만 떼고 오늘 라스트오더는 남긴다
  assert.equal(hoursForNow(raw, AUG), '20:00에 라스트오더');
  // 1월 — 겨울이니 그대로 둔다
  assert.equal(hoursForNow(raw, JAN), raw);
  // 4월 — 겨울도 여름도 아니면 계절 조건은 지금 얘기가 아니다
  assert.equal(hoursForNow(raw, APR), '20:00에 라스트오더');
});

test('영업시간: 계절 조건만 있으면 아예 말하지 않는다(모르는 건 안 쓴다)', () => {
  assert.equal(hoursForNow('동절기에는 저녁 8시까지 영업합니다.', AUG), undefined);
  assert.equal(hoursForNow('동절기에는 저녁 8시까지 영업합니다.', JAN), '동절기에는 저녁 8시까지 영업합니다.');
  assert.equal(hoursForNow('하절기에는 밤 10시까지', AUG), '하절기에는 밤 10시까지');
});

test('영업시간: 계절 조건이 없으면 원문 그대로', () => {
  assert.equal(hoursForNow('매일 10:00 - 22:00', AUG), '매일 10:00 - 22:00');
  assert.equal(hoursForNow('연중무휴 24시간', AUG), '연중무휴 24시간');
  assert.equal(hoursForNow(undefined, AUG), undefined);
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
  // 시각을 고정한다 — 안 그러면 이 테스트가 계절 따라 통과했다 실패했다 한다
  const summer = placeFromBrandTone(tone, AUG);
  assert.equal(summer?.hours, '20:00에 라스트오더', '8월에 동절기 안내를 오늘 시간으로 말하면 안 된다');
  assert.equal(summer?.descriptionRaw, '현리교차로 현리사거리 버스정류장 뒤 건물');

  const winter = placeFromBrandTone(tone, JAN);
  assert.equal(winter?.hours, '20:00에 라스트오더 - 동절기에는 저녁 8시까지 영업합니다.', '겨울엔 살아난다');
});

test('placeFromBrandTone: 전화번호에 붙은 안내 텍스트도 읽기 시점에 정제된다', () => {
  const place = placeFromBrandTone(
    { place_facts: { name: '준오헤어', address: '서울', phone: '0507-1318-0645안내', menu: [] } },
    AUG,
  );
  assert.equal(place?.phone, '0507-1318-0645');
});
