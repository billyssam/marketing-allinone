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
