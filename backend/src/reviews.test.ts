/**
 * 리뷰 감정분석 회귀 테스트 (무의존 · Node 내장 test 러너).
 * 실행: npx tsx --test src/reviews.test.ts
 *
 * 쿵더쿵 실데이터엔 부정 리뷰가 없어, 모니터링의 핵심인 부정 경로를 합성 케이스로 못박는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSentiment, analyzeReview, draftReply } from '../../shared/content-engine/review-analyzer.js';

test('부정: 강한 클레임은 negative로 분류', () => {
  const cases = [
    '음료가 미지근하게 나왔고 직원분도 불친절했어요. 다신 안 갈 듯',
    '머리카락이 나왔어요 최악입니다 환불 요청했는데',
    '너무 비싸고 웨이팅만 오래 기다렸어요 별로',
  ];
  for (const c of cases) {
    const r = analyzeSentiment(c);
    assert.equal(r.sentiment, 'negative', `"${c}" → ${r.sentiment}`);
    assert.ok(r.score < 0, `score<0 이어야: ${r.score}`);
    assert.ok(r.signals.negative.length > 0, '부정 신호가 잡혀야');
  }
});

test('범용성: 업종 맥락에서 음식 전용어가 오탐하지 않는다', () => {
  // 실측 사고 — '머리카락'·'위생'이 단독으로 강한부정에 있어서 미용실·네일샵·병원의
  // 명백한 칭찬이 negative로 뒤집혔다. 사장님은 칭찬에 부정 알림을 받고,
  // 기뻐한 손님은 "아쉬운 경험을 드려 죄송합니다" 답글을 받게 되는 상태였다.
  const shouldBePositive = [
    '머리카락이 많이 상했었는데 살려주셔서 감사해요. 너무 만족스럽습니다!',
    '펌하고 나서 머리카락 결이 훨씬 부드러워졌어요. 강추합니다',
    '위생 철저하고 도구도 매번 소독해주셔서 안심하고 받았어요',
    '위생적이고 시설도 깔끔합니다. 친절하세요',
  ];
  for (const c of shouldBePositive) {
    const r = analyzeSentiment(c);
    assert.equal(r.sentiment, 'positive', `"${c}" → ${r.sentiment} (근거: ${r.signals.negative})`);
  }
  // 음식점의 진짜 클레임은 그대로 잡혀야 한다
  const stillNegative = analyzeSentiment('머리카락이 나왔어요. 위생 상태가 너무 별로입니다');
  assert.equal(stillNegative.sentiment, 'negative');
});

test('범용성: 비음식 업종 긍정어와 붙여쓴 표현을 인식한다', () => {
  // 사전이 음식에 치우쳐 시술·의료·운동 리뷰가 중립으로 샜다(정형외과 10건 중 3건).
  const cases = [
    '루루쌤 손도 빠르시고 쉐입 칼각으로 잡아주십니다',
    '과잉진료없이 치료를 해주십니다 효과좋아요', // 띄어쓰기 없는 실제 리뷰 형태
    '자세히 설명해주시고 꼼꼼하게 봐주셔서 좋았어요',
    '진짜 너무너무 예뽀요 선생님이 꼼꼼하고 예뿌게 잘해주셔서',
  ];
  for (const c of cases) {
    const r = analyzeSentiment(c);
    assert.equal(r.sentiment, 'positive', `"${c}" → ${r.sentiment}`);
  }
});

test('범용성: 공백 정규화가 단어 경계를 넘지 않는다', () => {
  // 전체에 공백 제거 매칭을 적용했더니 "해주십니다신장분사기"에서 '다신'(강한부정)이
  // 걸려 칭찬이 부정으로 뒤집혔다 → 띄어쓰기가 있는 항목에만 적용하도록 좁혔다.
  const r = analyzeSentiment('과잉진료없이 치료를 해주십니다 신장분사기와 주사치료 효과좋아요');
  assert.equal(r.sentiment, 'positive', `→ ${r.sentiment} (부정근거: ${r.signals.negative})`);
  assert.ok(!r.signals.negative.includes('다신'), '경계를 넘은 오탐이 없어야');
});

test('긍정: 칭찬 리뷰는 positive로 분류', () => {
  const cases = [
    '대추차가 진하고 너무 맛있어요 사장님도 친절하시고 또 갈게요',
    '분위기 아늑하고 깔끔해요 강추합니다',
    '커피 맛있고 가성비 좋아요',
  ];
  for (const c of cases) {
    const r = analyzeSentiment(c);
    assert.equal(r.sentiment, 'positive', `"${c}" → ${r.sentiment}`);
    assert.ok(r.score > 0, `score>0 이어야: ${r.score}`);
  }
});

test('중립: 신호 없으면 neutral', () => {
  const r = analyzeSentiment('오늘 오후에 방문했습니다');
  assert.equal(r.sentiment, 'neutral');
});

test('강한 부정 우선: 칭찬+클레임 섞여도 놓치지 않는다', () => {
  // 맛은 좋았지만 머리카락 이물질 → 사장님이 반드시 봐야 함
  const r = analyzeSentiment('맛은 좋았는데 음료에서 머리카락이 나와서 너무 불쾌했어요');
  assert.equal(r.sentiment, 'negative');
});

test('답글초안: 부정엔 사과, 긍정엔 감사 표현 포함', () => {
  const neg = draftReply(
    { storeName: '쿵더쿵', author: '홍길동', content: '불친절했어요', keywords: [] },
    'negative',
  );
  assert.match(neg, /죄송|사과/, '부정 답글엔 사과가 있어야');
  assert.match(neg, /쿵더쿵/, '상호가 들어가야');

  const pos = draftReply(
    { storeName: '쿵더쿵', author: '홍길동', content: '맛있어요', keywords: ['커피가 맛있어요'] },
    'positive',
  );
  assert.match(pos, /감사|힘이 났|환해/, '긍정 답글엔 감사가 있어야');
});

test('결정적: 같은 리뷰는 항상 같은 답글 (재크롤 시 답글 안 흔들림)', () => {
  const review = { externalId: 'x', author: '김철수', content: '커피가 정말 맛있어요 또 올게요', keywords: [] };
  const a = analyzeReview(review, '쿵더쿵');
  const b = analyzeReview(review, '쿵더쿵');
  assert.equal(a.replyDraft, b.replyDraft);
  assert.equal(a.sentiment, b.sentiment);
});
