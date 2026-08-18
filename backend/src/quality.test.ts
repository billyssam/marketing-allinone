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
import {
  hasConcreteFact,
  notOwnerVoice,
  dropFabricatedRegionTags,
  CHANNEL_BRIEF,
} from '../../shared/content-engine/channel-native.js';

const ok = (channel: string, bodyPlain: string, title?: string) => ({ channel, bodyPlain, title });

test('목표 분량을 브리프에서 파싱한다(별도 표를 두지 않는다)', () => {
  assert.deepEqual(targetLength('naver_place'), [150, 250]);
  assert.deepEqual(targetLength('kakao_channel'), [120, 250]);
  assert.equal(targetLength('없는채널'), null);
});

/**
 * **브리프가 있는 채널은 전부 목표 분량이 잡혀야 한다.**
 *
 * 예전 정규식은 `**150~250자**`처럼 별표 바로 뒤 숫자만 인식했다. 그래서
 * "**전체 200~350자를 채울 것**"이라고 쓴 스레드는 목표가 null이 되어
 * **분량 검사를 아예 안 받고 있었다.** 남은 것만 세면 통째로 빠진 항목이 '통과'로 찍힌다.
 */
test('전수: 브리프가 있는 모든 채널에 목표 분량이 잡힌다', () => {
  const missing: string[] = [];
  for (const id of Object.keys(CHANNEL_BRIEF)) {
    const r = targetLength(id);
    if (!r) missing.push(id);
    else assert.ok(r[0] > 0 && r[1] > r[0], `${id} 범위가 이상하다: ${r.join('~')}`);
  }
  assert.deepEqual(missing, [], `목표 분량이 안 잡히는 채널: ${missing.join(', ')}`);
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

/**
 * 화자 — 사장님이 자기 가게 계정으로 올리는 글이다.
 * 손님·이웃이 추천하는 말투가 나가면 바이럴 조작으로 읽혀 계정이 위험해진다.
 * 규칙을 좁게 잡았다: 본인 소감("…이더라구요")은 정상이고 전언만 잡는다.
 * 운영 203건 실측에서 2건 적중·오탐 0으로 확인하고 채택했다.
 */
test('사장님 말투가 아닌 것만 잡는다(실측 문장 그대로)', () => {
  // 실제로 나갔던 것들
  // 자기 가게를 "동네의 어떤 가게"로 소개 — 상호를 넘겨야 정확히 잡힌다
  assert.ok(notOwnerVoice("저희 동네 '햇살공방'에서 반지 만들기 원데이클래스를 하고 있더라구요!", '햇살공방'));
  // 상호가 없으면 "우리 동네"만으로는 잡지 않는다 — 사장님이 흔히 쓰는 정상 표현이다
  assert.equal(notOwnerVoice('우리 동네 이웃 여러분, 오늘도 문 열었습니다!', '햇살공방'), undefined);
  assert.ok(notOwnerVoice('요기 아메리카노(3,500원)가 그렇게 시원하고 맛있대요.'));
  assert.ok(notOwnerVoice('45,000원에 특별한 추억을 만들 수 있다니 솔깃하네요!'));
  assert.ok(notOwnerVoice('은수저 각인 클래스(62,000원)도 있대요.'));

  // 사장님 본인 소감·정상 홍보는 건드리지 않는다
  assert.equal(notOwnerVoice('아메리카노에 갓 구운 크로플을 곁들이니 이게 바로 여름날의 행복이더라구요.'), undefined);
  assert.equal(notOwnerVoice('대추의 깊고 진한 풍미가 마음까지 편안하게 해주더라구요.'), undefined);
  assert.equal(notOwnerVoice('저희 쿵더쿵입니다. 오늘은 수제대추차를 준비했어요.'), undefined);
  assert.equal(notOwnerVoice('안녕하세요, 안내면 주민 여러분! 쿵더쿵에서 여름 저녁 휴식을 즐겨보세요.'), undefined);
  assert.equal(notOwnerVoice('배달은 요기요에서도 주문하실 수 있어요.'), undefined);
});

test('주소에 없는 지역 해시태그는 뺀다(주소 없는 공방에 #서울공방이 붙었다)', () => {
  const tags = ['햇살공방', '반지만들기', '서울공방', '원데이클래스'];
  // 주소 자체가 없는 매장 — 지역 태그는 전부 지어낸 것이다
  assert.deepEqual(dropFabricatedRegionTags(tags, null), ['햇살공방', '반지만들기', '원데이클래스']);
  // 주소에 있는 지역은 남긴다
  assert.deepEqual(dropFabricatedRegionTags(tags, '서울 강남구 테헤란로 101'), tags);
  // 다른 지역이면 뺀다
  assert.deepEqual(
    dropFabricatedRegionTags(['부산맛집', '옥천카페'], '충북 옥천군 안내면 현리3길 16'),
    ['옥천카페'],
  );
});

/**
 * 생성 규칙과 점검 규칙이 서로 모순이면 매일 가짜 결함이 뜬다.
 * angles.ts의 'plain' 스타일은 **상호를 앞에 두어도 되는** 제목인데 점검이 그걸 몰라서,
 * 로테이션이 그 스타일을 고른 날 5개 채널이 통째로 결함으로 찍혔다(2026-08-15 무인 크론).
 */
test("제목 스타일 'plain'인 날은 상호로 시작해도 잡지 않는다(실측 제목 그대로)", () => {
  const title = '옥천 쿵더쿵, 8월의 열기 식히는 초콜릿과 빙수';
  const body = '본문 '.repeat(400);

  // 스타일을 모르면 예전처럼 엄격하게 — 기본 동작은 그대로 둔다
  const strict = checkPosts([{ channel: 'blog', title, bodyPlain: body }], '쿵더쿵');
  assert.ok(strict.some((i) => i.rule === 'title-prefix'), JSON.stringify(strict));

  // 'plain'을 고른 날은 의도된 형태다
  const allowed = checkPosts([{ channel: 'blog', title, bodyPlain: body, titleStyle: 'plain' }], '쿵더쿵');
  assert.ok(!allowed.some((i) => i.rule === 'title-prefix'), JSON.stringify(allowed));

  // 다른 스타일인데 상호로 시작하면 여전히 잡는다 — 지시를 안 지킨 것이다
  const other = checkPosts([{ channel: 'blog', title, bodyPlain: body, titleStyle: 'situation' }], '쿵더쿵');
  assert.ok(other.some((i) => i.rule === 'title-prefix'), JSON.stringify(other));
});
