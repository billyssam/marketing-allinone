import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeReviewLists } from '../../shared/reviews/list-merge.js';

type R = { id: string; sentiment: string; sent: boolean };
const r = (id: string, sentiment: string, sent = false): R => ({ id, sentiment, sent });

/**
 * ⚠️ 이 자리에 예전엔 "감정 값의 알파벳 순서가 곧 심각도 순서다"라는 테스트가 있었다.
 * **통과했지만 거짓이었다** — 실제 `sentiment`는 enum이고 선언 순서가
 * `positive, neutral, negative`라 DB 오름차순은 긍정 먼저였다.
 * 내 가정을 검증하는 테스트는 결함을 못 잡는다. 그래서 스키마 순서에 기대는 방식을 버리고,
 * **꼭 보여야 하는 것을 따로 가져와 합치는** 방식과 그 합치기를 검증한다.
 */

test('부정 미답은 일반 목록이 limit을 다 먹어도 살아남는다', () => {
  const negatives = Array.from({ length: 40 }, (_, i) => r(`neg${i}`, 'negative'));
  const general = Array.from({ length: 200 }, (_, i) => r(`gen${i}`, 'positive'));

  const merged = mergeReviewLists({ mustShow: negatives, general, recentDone: [] }, 100);

  assert.equal(merged.length, 100);
  const kept = merged.filter((x) => x.id.startsWith('neg')).length;
  assert.equal(kept, 40, `부정 40건 중 ${kept}건만 살아남았다 — "놓치지 않는다"는 약속이 깨진다`);
});

test('방금 완료한 리뷰가 살아남는다 — 아니면 완료 취소를 못 누른다', () => {
  const done = [r('done1', 'positive', true)];
  const general = Array.from({ length: 300 }, (_, i) => r(`gen${i}`, 'neutral'));

  const merged = mergeReviewLists({ mustShow: [], general, recentDone: done }, 100);
  assert.ok(merged.some((x) => x.id === 'done1'), '완료한 리뷰가 목록 밖으로 밀렸다');
});

test('중복은 한 번만 — 같은 리뷰가 두 목록에 있어도 카드가 두 장 안 나온다', () => {
  const shared = r('same', 'negative');
  const merged = mergeReviewLists({ mustShow: [shared], general: [shared], recentDone: [shared] }, 100);
  assert.equal(merged.length, 1);
});

test('limit을 넘기지 않는다 — 렌더 비용 상한을 지킨다', () => {
  const many = Array.from({ length: 500 }, (_, i) => r(`x${i}`, 'negative'));
  assert.equal(mergeReviewLists({ mustShow: many, general: [], recentDone: [] }, 100).length, 100);
});

test('세 목록이 다 비면 빈 배열 — 빈 화면에서 터지지 않는다', () => {
  assert.deepEqual(mergeReviewLists<R>({ mustShow: [], general: [], recentDone: [] }, 100), []);
});
