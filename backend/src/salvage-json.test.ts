import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salvageDraftJson } from '../../shared/content-engine/salvage-json.js';

const LONG = '<p>' + '옥천 안내면 쿵더쿵의 여름 이야기입니다. '.repeat(12) + '</p>';

test('정상 JSON도 건져낸다(파싱 성공 경로와 같은 값)', () => {
  const raw = JSON.stringify({ title: '여름날의 쿵더쿵', bodyHtml: LONG, tags: ['옥천'] });
  const s = salvageDraftJson(raw);
  assert.equal(s?.title, '여름날의 쿵더쿵');
  assert.equal(s?.bodyHtml, LONG);
});

test('본문 한가운데 이스케이프 안 된 따옴표 — 실측 실패(8/27) 재현', () => {
  // 실제 실패: line 3 column 3392, Expected ',' or '}' after property value
  const broken =
    '{\n  "title": "여름날의 쿵더쿵",\n  "bodyHtml": "<p>사장님이 "이건 꼭 드셔보세요"라고 하셨다.</p>' +
    LONG +
    '",\n  "tags": ["옥천","빙수"]\n}';
  assert.throws(() => JSON.parse(broken), '전제: 이 원문은 JSON.parse가 실패해야 한다');

  const s = salvageDraftJson(broken);
  assert.ok(s, '건져야 한다');
  assert.equal(s.title, '여름날의 쿵더쿵');
  assert.ok(s.bodyHtml.includes('이건 꼭 드셔보세요'), '따옴표 앞부분이 살아야 한다');
  assert.ok(s.bodyHtml.includes('</p>'), '따옴표 뒷부분도 살아야 한다 — 여기서 자르면 반쪽 글이다');
  assert.equal(s.how, 'unescaped-quote');
});

test('응답이 중간에 잘린 경우 — 남은 본문을 살린다', () => {
  const truncated = '{\n  "title": "여름날의 쿵더쿵",\n  "bodyHtml": "' + LONG;
  assert.throws(() => JSON.parse(truncated));
  const s = salvageDraftJson(truncated);
  assert.ok(s);
  assert.ok(s.bodyHtml.length > 50);
  assert.equal(s.how, 'truncated');
});

test('이스케이프를 실제 문자로 되돌린다', () => {
  const raw = '{"title":"제목","bodyHtml":"<p>줄1\\n줄2 \\"인용\\" 끝</p>' + LONG + '"}';
  const s = salvageDraftJson(raw);
  assert.ok(s!.bodyHtml.includes('\n'), '\\n이 줄바꿈이 돼야 한다');
  assert.ok(s!.bodyHtml.includes('"인용"'), '\\"가 따옴표가 돼야 한다');
});

test('건질 게 없으면 null — 빈 글을 만들어내지 않는다', () => {
  assert.equal(salvageDraftJson(''), null);
  assert.equal(salvageDraftJson('완전히 다른 텍스트'), null);
  assert.equal(salvageDraftJson('{"title":"제목만 있고 본문이 없다"}'), null);
  // 본문이 50자 미만이면 글이라 할 수 없다 — 스키마와 같은 기준
  assert.equal(salvageDraftJson('{"title":"제목","bodyHtml":"너무 짧다"}'), null);
});

test('제목이 비면 null — 제목 없는 글을 사장님께 주지 않는다', () => {
  assert.equal(salvageDraftJson('{"title":"","bodyHtml":"' + LONG + '"}'), null);
});
