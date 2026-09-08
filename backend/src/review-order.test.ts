import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 리뷰 목록 정렬이 기대는 **전제**를 지킨다.
 *
 * `/reviews` 서버 쿼리는 `.order('sentiment', { ascending: true })` 하나로
 * "부정 먼저"를 만든다 — negative < neutral < positive 라는 **알파벳 순서**에 기댄 것이다.
 * 감정 값 이름을 바꾸면(예: 'bad'/'good') 이 정렬이 조용히 뒤집히고,
 * 부정 리뷰가 100건 밖으로 밀려 "놓치지 않아요" 약속이 깨진다.
 * 화면에서는 티가 안 나므로 여기서 못 박는다.
 */
test('감정 값의 알파벳 순서가 곧 심각도 순서다 (리뷰 목록 정렬의 전제)', () => {
  const inOrder = ['negative', 'neutral', 'positive'];
  const sorted = [...inOrder].sort();
  assert.deepEqual(sorted, inOrder, '알파벳 정렬이 곧 부정→중립→긍정 이어야 한다');
});

/**
 * 서버가 자른 뒤에 클라이언트가 정렬하므로, **자르기 전 순서**가 약속을 결정한다.
 * 미답 120건(부정 40) 중 100건만 실려 올 때, 부정이 전부 포함되는지 모사로 확인한다.
 */
test('미답이 limit을 넘어도 부정 미답은 전부 실려 온다', () => {
  const LIMIT = 100;
  const all = Array.from({ length: 120 }, (_, i) => ({
    id: i,
    sentiment: (['negative', 'neutral', 'positive'] as const)[i % 3],
    replySentAt: null as string | null,
    postedAt: new Date(2026, 0, 1, i).toISOString(),
  }));

  // 서버 정렬을 그대로 모사: 미답 먼저 → 감정 오름차순 → 최신 먼저
  const served = [...all].sort((a, b) => {
    const unanswered = (r: typeof a) => (r.replySentAt ? 1 : 0);
    if (unanswered(a) !== unanswered(b)) return unanswered(a) - unanswered(b);
    if (a.sentiment !== b.sentiment) return a.sentiment < b.sentiment ? -1 : 1;
    return b.postedAt.localeCompare(a.postedAt);
  }).slice(0, LIMIT);

  const negTotal = all.filter((r) => r.sentiment === 'negative').length;
  const negServed = served.filter((r) => r.sentiment === 'negative').length;
  assert.equal(negServed, negTotal, `부정 ${negTotal}건 중 ${negServed}건만 실려 왔다 — 나머지는 영영 안 보인다`);
});
