/**
 * 콘텐츠 품질 점검 회귀 테스트.
 * 실행: npx tsx --test src/quality.test.ts
 *
 * 이 점검이 사람 없는 날의 유일한 눈이다 — 놓치면 조용히 나쁜 글이 며칠씩 나간다.
 * 반대로 오탐이 잦으면 알림을 아예 안 보게 되므로 양쪽을 다 고정한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPosts, targetLength } from '../../shared/content-engine/quality.js';
import { hasConcreteFact } from '../../shared/content-engine/channel-native.js';

const ok = (channel: string, bodyPlain: string, title?: string) => ({ channel, bodyPlain, title });

test('목표 분량을 브리프에서 파싱한다(별도 표를 두지 않는다)', () => {
  assert.deepEqual(targetLength('naver_place'), [150, 250]);
  assert.deepEqual(targetLength('kakao_channel'), [120, 250]);
  assert.equal(targetLength('없는채널'), null);
});

test('정상 글은 아무것도 잡지 않는다(오탐 방지)', () => {
  const posts = [
    ok('naver_place', '옥천 안내면에 자리한 가게에서 잠시 쉬어가세요. '.repeat(5) + '초콜릿(10,000원)과 함께요. 저녁 8시까지 영업합니다.'),
    ok('blog', '본문 '.repeat(500), '버터 향 스치는 길, 달콤한 유혹'),
  ];
  assert.deepEqual(checkPosts(posts, '쿵더쿵'), []);
});

test('빈 본문을 잡는다', () => {
  const r = checkPosts([ok('naver_place', '   ')], '쿵더쿵');
  assert.equal(r[0].rule, 'empty');
});

test('하한 미달을 잡는다 — 상한 초과는 잡지 않는다(채널마다 자연스러운 길이가 다르다)', () => {
  const short = checkPosts([ok('naver_place', '너무 짧은 소식. 10,000원.')], '쿵더쿵');
  assert.ok(short.some((i) => i.rule === 'too-short'), JSON.stringify(short));
  // 페북은 목표 500~750인데 실측이 760~800이어도 문제가 아니었다
  const long = checkPosts([ok('facebook', '가 '.repeat(500) + '10,000원')], '쿵더쿵');
  assert.ok(!long.some((i) => i.rule === 'too-short'));
});

test('정보 채널에 사실이 없으면 잡는다', () => {
  const r = checkPosts([ok('naver_place', '분위기 좋은 공간입니다. '.repeat(10))], '쿵더쿵');
  assert.ok(r.some((i) => i.rule === 'no-facts'), JSON.stringify(r));
  // 감성 채널(스레드)은 사실이 없어도 통과 — 강제하면 오탐이 된다
  const t = checkPosts([ok('threads', '오늘 문득 그런 생각이 들었어요. '.repeat(10))], '쿵더쿵');
  assert.ok(!t.some((i) => i.rule === 'no-facts'));
});

test('매장에 사실이 없으면 사실 주입을 요구하지 않는다(고칠 수 없는 지적 방지)', () => {
  // 플레이스 미연결 + 항목 미입력 매장은 넣을 사실이 없어서 못 넣는 것이다.
  // 매일 결함으로 올리면 고칠 수도 없는 알림이 쌓여 전체를 안 보게 된다.
  const post = [ok('naver_place', '분위기 좋은 공간입니다. '.repeat(10))];
  assert.ok(checkPosts(post, '쿵더쿵').some((i) => i.rule === 'no-facts'), '기본은 잡아야');
  assert.ok(
    !checkPosts(post, '쿵더쿵', { storeHasFacts: false }).some((i) => i.rule === 'no-facts'),
    '사실이 없는 매장은 면제',
  );
  // 면제해도 다른 규칙은 그대로 본다
  const bad = checkPosts([ok('naver_place', '쿵더쿵는 좋아요')], '쿵더쿵', { storeHasFacts: false });
  assert.ok(bad.some((i) => i.rule === 'josa'));
});

test('상호 조사 오류를 잡는다(받침 유무 양방향)', () => {
  const a = checkPosts([ok('naver_place', '쿵더쿵는 늘 이 자리에서. 10,000원. '.repeat(6))], '쿵더쿵');
  assert.ok(a.some((i) => i.rule === 'josa'), JSON.stringify(a));
  // 받침 없는 상호에 '은'을 붙여도 틀린 것
  const b = checkPosts([ok('naver_place', '라운지은 늘 이 자리에서. 10,000원. '.repeat(6))], '라운지');
  assert.ok(b.some((i) => i.rule === 'josa'), JSON.stringify(b));
  // 올바른 조사는 통과
  const c = checkPosts([ok('naver_place', '쿵더쿵은 늘 이 자리에서. 10,000원. '.repeat(6))], '쿵더쿵');
  assert.ok(!c.some((i) => i.rule === 'josa'));
});

test('제목이 상호로 시작하는 틀을 잡는다', () => {
  const r = checkPosts([ok('blog', '본문 '.repeat(400), '옥천 쿵더쿵, 여름 신메뉴 나왔습니다')], '쿵더쿵');
  assert.ok(r.some((i) => i.rule === 'title-prefix'), JSON.stringify(r));
  // 상호가 뒤에 오면 정상
  const okTitle = checkPosts([ok('blog', '본문 '.repeat(400), '버터 향 번지는 오후, 옥천 쿵더쿵에서')], '쿵더쿵');
  assert.ok(!okTitle.some((i) => i.rule === 'title-prefix'));
});

/**
 * 사실 판정은 생성(channel-native)과 점검(quality)이 **한 벌**이어야 한다.
 * 두 벌이면 생성은 통과시키고 점검만 잡는(또는 반대) 어긋남이 생긴다.
 */
test('사실 판정 잣대가 생성 쪽과 같다', () => {
  const yes = ['수제대추차 5,800원', '20:00에 라스트오더', '저녁 8시까지', '043-733-6616'];
  const no = ['분위기 좋은 공간입니다', '따뜻한 위로를 드려요', '깊고 진한 풍미'];
  for (const s of yes) assert.equal(hasConcreteFact(s), true, s);
  for (const s of no) assert.equal(hasConcreteFact(s), false, s);
});

test('정보 채널에 사실이 없으면 점검이 잡는다(2026-08-13 실측 문장 그대로)', () => {
  // 실제로 나갔던 플레이스 소식 — 가격도 시간도 없다
  const body =
    '한여름 옥천의 쨍한 햇살에 지칠 때, 쿵더쿵의 수제대추차 한 잔으로 위로받으세요. ' +
    '땀 흘리는 여름날에도 마음을 차분하게 가라앉히는 깊은 풍미와 따뜻한 기운이 몸속 깊이 퍼져 편안함을 선사합니다. ' +
    '붉고 진한 빛깔, 은은한 대추향, 묵직하면서도 깔끔한 여운까지. 시판 대추차와는 비교할 수 없는 진한 추억과 위로를 선사하는 쿵더쿵 수제대추차를 지금 만나보세요.';
  const issues = checkPosts([{ channel: 'naver_place', title: null, bodyPlain: body }], '쿵더쿵', {
    storeHasFacts: true,
  });
  assert.ok(issues.some((i) => i.rule === 'no-facts'), `잡아야 한다: ${JSON.stringify(issues)}`);

  // 가격 한 줄만 붙어도 통과 — 보정의 마지막 방어선이 실제로 통과시키는지 확인
  const repaired = `${body}\n\n수제대추차 5,800원 · 20:00에 라스트오더`;
  const after = checkPosts([{ channel: 'naver_place', title: null, bodyPlain: repaired }], '쿵더쿵', {
    storeHasFacts: true,
  });
  assert.ok(!after.some((i) => i.rule === 'no-facts'), `보정 후엔 통과해야: ${JSON.stringify(after)}`);
});
