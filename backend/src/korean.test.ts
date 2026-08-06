/**
 * 한국어 조사 회귀 테스트.
 * 실행: npx tsx --test src/korean.test.ts
 *
 * 상호는 매장마다 다르고 절반은 받침이 있다 — 고정 조사를 쓰면 손님에게 나가는 글의
 * 절반이 틀린다. 실제로 "쿵더쿵는 늘 이 자리에서…"가 답글로 나갔다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasBatchim, josa, withJosa } from '../../shared/korean.js';
import { draftReply } from '../../shared/content-engine/review-analyzer.js';
import { draftReactivation } from '../../shared/content-engine/reactivation.js';

test('받침 판정', () => {
  for (const w of ['쿵더쿵', '김밥천국', '스타일링룸', '분식', '미용실']) assert.equal(hasBatchim(w), true, w);
  // '스'는 ㅅ+ㅡ로 받침이 없다 → "헬스는"이 맞다
  for (const w of ['카페', '헬스', '라운지', '스시야', '커피']) assert.equal(hasBatchim(w), false, w);
});

test('조사 선택', () => {
  assert.equal(withJosa('쿵더쿵', '은는'), '쿵더쿵은');
  assert.equal(withJosa('라운지', '은는'), '라운지는');
  assert.equal(withJosa('분식', '이가'), '분식이');
  assert.equal(withJosa('카페', '이가'), '카페가');
  assert.equal(withJosa('쿵더쿵', '이에요예요'), '쿵더쿵이에요');
  assert.equal(withJosa('라운지', '이에요예요'), '라운지예요');
});

test("'ㄹ' 받침은 '으로'가 아니라 '로'", () => {
  assert.equal(josa('서울', '으로로'), '로');
  assert.equal(josa('분식', '으로로'), '으로');
  assert.equal(josa('카페', '으로로'), '로');
});

test('영문·숫자로 끝나는 상호도 터지지 않는다', () => {
  for (const w of ['CARTON', 'cafe24', '1984', '']) {
    assert.doesNotThrow(() => withJosa(w, '은는'));
  }
});

test('답글 초안에 조사가 맞게 들어간다(실제 사고 재현)', () => {
  // 받침 있는 상호로 여러 번 뽑아 "OO는"이 한 번도 나오면 안 된다
  const bad: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = draftReply(
      { author: `손님${i}`, content: '친절하고 좋았어요 또 올게요', keywords: [], storeName: '쿵더쿵' },
      'positive',
    );
    if (r.includes('쿵더쿵는') || r.includes('쿵더쿵가') || r.includes('쿵더쿵예요')) bad.push(r);
  }
  assert.equal(bad.length, 0, `조사 오류: ${bad[0] ?? ''}`);
});

test('재방문 메시지에도 조사가 맞게 들어간다', () => {
  const bad: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = draftReactivation({ name: `단골${i}`, storeName: '분식', daysSince: 40 + i, nowMs: Date.parse('2026-08-06T00:00:00Z') });
    if (m.includes('분식가') || m.includes('분식예요')) bad.push(m);
  }
  assert.equal(bad.length, 0, `조사 오류: ${bad[0] ?? ''}`);
});
