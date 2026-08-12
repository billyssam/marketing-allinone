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
import { seasonalContext } from '../../shared/content-engine/seasonal.js';

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

/**
 * 아래 세 테스트는 "남은 것을 세지 말고 없는 것을 찾자"의 결과다.
 * 위 테스트들은 **상호** 조사만 봤고, 그래서 절기 이름·'으로/로'·키워드는 한 번도 검사되지 않았다.
 * 특히 재방문 테스트의 기준시각(8/6)은 어느 절기와도 ±5일이 아니라 절기 분기에 **도달조차 못 했다**.
 */

test('절기 이름 조사 — 12개 전부(받침 없는 절기가 7개다)', () => {
  // 각 절기 당일을 기준시각으로 잡아 그 분기를 실제로 통과시킨다
  const days: [string, string][] = [
    ['2026-01-01', '새해'], ['2026-02-14', '발렌타인데이'], ['2026-03-01', '새 학기'],
    ['2026-03-14', '화이트데이'], ['2026-05-05', '어린이날'], ['2026-05-08', '어버이날'],
    ['2026-05-15', '스승의날'], ['2026-08-15', '광복절'], ['2026-09-01', '가을 새 학기'],
    ['2026-11-11', '빼빼로데이'], ['2026-12-25', '크리스마스'], ['2026-12-31', '연말·송년'],
  ];
  for (const [day, label] of days) {
    const nowMs = Date.parse(`${day}T03:00:00Z`);
    const s = seasonalContext(nowMs);
    assert.equal(s.occasion, label, `${day} 절기 인식 실패`);
    // 프롬프트 힌트: "크리스마스이에요" 같은 형태가 나오면 안 된다
    assert.ok(!s.hint.includes(`${label}이에요`) || hasBatchim(label), `힌트 조사 오류: ${s.hint}`);
    // 재방문 문자: "곧 크리스마스이라"가 손님 휴대폰으로 나갔다
    const m = draftReactivation({ name: '단골', storeName: '분식', daysSince: 45, nowMs });
    assert.ok(!m.includes(`${label}이라`) || hasBatchim(label), `문자 조사 오류: ${m}`);
    assert.ok(!m.includes(`${label}라`) || !hasBatchim(label), `문자 조사 오류: ${m}`);
  }
});

test("답글의 '으로/로' — 받침 있는 상호에 '로'가 붙으면 안 된다", () => {
  for (const store of ['쿵더쿵', '김밥천국', '분식', '카페', '서울', '스타일링룸']) {
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      seen.add(draftReply({ author: `손님${i}`, content: `불친절했고 오래 기다렸어요 ${i}`, keywords: [], storeName: store }, 'negative'));
    }
    for (const r of seen) {
      if (!r.includes('달라진')) continue;
      assert.ok(r.includes(`달라진 ${withJosa(store, '으로로')} `), `'으로/로' 오류(${store}): ${r}`);
    }
  }
});

test("긍정 답글의 '이라고/라고' — 키워드 받침을 본다", () => {
  const pairs: [string, string][] = [['친절', '친절이라고'], ['맛', '맛이라고'], ['커피', '커피라고'], ['분위기', '분위기라고']];
  for (const [kw, expect] of pairs) {
    // detail이 잡히면 따옴표 분기로 새니, 본문을 짧게 줘서 키워드 분기를 태운다
    const r = draftReply({ author: '손님', content: '굿', keywords: [kw], storeName: '카페' }, 'positive');
    assert.ok(r.includes(expect), `키워드 조사 오류(${kw}): ${r}`);
  }
});
