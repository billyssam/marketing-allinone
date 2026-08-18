/**
 * 모델 응답 스키마 회귀 테스트.
 * 실행: npx tsx --test src/draft-schema.test.ts
 *
 * 배경(2026-08-16 무인 크론): 모델이 tags를 배열이 아닌 값으로 줬고 zod가 throw해서
 * **스타일링룸 하루치 초안이 통째로 0**이 됐다. 사장님은 아침에 빈 화면을 본다.
 * 해시태그 몇 개 때문에 본문까지 버리는 건 값이 안 맞는 거래다 —
 * 필수는 제목·본문뿐이고 부가 필드는 정규화하거나 비워서 통과시킨다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftOutputSchema } from '../../shared/content-engine/gemini-client.js';

const base = {
  title: '버터 향 번지는 오후, 옥천 쿵더쿵에서',
  bodyHtml: '<p>본문</p>'.repeat(20),
  suggestedPhotoOrder: [0, 1, 2],
};

test('tags가 문자열로 와도 글을 버리지 않는다(실제로 매장을 죽인 형태)', () => {
  const r = draftOutputSchema.safeParse({ ...base, tags: '옥천카페, 수제대추차, 안내면' });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  assert.deepEqual(r.data!.tags, ['옥천카페', '수제대추차', '안내면']);
});

test('tags 형태가 무엇이든 통과시킨다 — 부가 필드다', () => {
  for (const tags of [undefined, null, 42, {}, [], '#옥천카페 #디저트']) {
    const r = draftOutputSchema.safeParse({ ...base, tags });
    assert.ok(r.success, `tags=${JSON.stringify(tags)} → ${JSON.stringify(r.error?.issues)}`);
  }
  // '#'은 떼고 담는다
  const r = draftOutputSchema.safeParse({ ...base, tags: ['#옥천카페', '디저트'] });
  assert.deepEqual(r.data!.tags, ['옥천카페', '디저트']);
});

test('태그가 3개 미만이어도 통과한다(예전엔 min(3)이라 글 전체가 죽었다)', () => {
  const r = draftOutputSchema.safeParse({ ...base, tags: ['옥천카페'] });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test('사진 순서가 깨져도 비우고 통과한다', () => {
  const r = draftOutputSchema.safeParse({ ...base, tags: ['a'], suggestedPhotoOrder: 'first' });
  assert.ok(r.success);
  assert.deepEqual(r.data!.suggestedPhotoOrder, []);
  const r2 = draftOutputSchema.safeParse({ ...base, tags: ['a'], suggestedPhotoOrder: [0, 'x', -1, 2] });
  assert.deepEqual(r2.data!.suggestedPhotoOrder, [0, 2]);
});

test('제목·본문이 없으면 실패한다 — 이건 진짜 못 쓴다', () => {
  assert.equal(draftOutputSchema.safeParse({ ...base, title: '', tags: ['a'] }).success, false);
  assert.equal(draftOutputSchema.safeParse({ ...base, bodyHtml: '짧음', tags: ['a'] }).success, false);
  assert.equal(draftOutputSchema.safeParse({ tags: ['a'] }).success, false);
});
