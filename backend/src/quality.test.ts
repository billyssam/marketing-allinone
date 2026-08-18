/**
 * 콘텐츠 품질 점검 회귀 테스트.
 * 실행: npx tsx --test src/quality.test.ts
 *
 * 이 점검이 사람 없는 날의 유일한 눈이다 — 놓치면 조용히 나쁜 글이 며칠씩 나간다.
 * 반대로 오탐이 잦으면 알림을 아예 안 보게 되므로 양쪽을 다 고정한다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPosts,
  criticalOf,
  findDuplicates,
  hasCritical,
  targetLength,
} from '../../shared/content-engine/quality.js';
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
 * 광역 지자체만 보던 시절 `#강남수학`·`#역삼수학`이 그대로 나갔다(2026-08-18, 주소 없는 학원).
 * 모델은 업종마다 정해진 동네를 기본값처럼 부른다 — 학원이면 강남·목동, 카페면 성수·연남.
 */
test('구·동 단위 지명도 잡는다(주소 없는 학원에 #강남수학이 붙었다)', () => {
  const tags = ['한빛수학학원', '수학클리닉', '강남수학', '역삼수학', '수학공부법'];
  assert.deepEqual(dropFabricatedRegionTags(tags, null), ['한빛수학학원', '수학클리닉', '수학공부법']);
  // 진짜 강남에 있는 학원이면 남긴다
  assert.deepEqual(
    dropFabricatedRegionTags(['강남수학', '역삼수학'], '서울 강남구 역삼동 123'),
    ['강남수학', '역삼수학'],
  );
  // 카페·미용실이 즐겨 붙는 상권도
  assert.deepEqual(dropFabricatedRegionTags(['성수카페', '연남맛집', '수제디저트'], null), ['수제디저트']);
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

/**
 * ─────────────────────────────────────────────────────────────
 * 2026-08-13에 **사람이 정독해서** 찾은 결함들.
 * 그날 이 점검은 전부 초록불이었다. 자동 점검은 내가 미리 생각한 실패만 잡는다.
 * 아래는 그때 놓친 세 유형이 이제 잡히는지 고정하는 테스트다.
 * ─────────────────────────────────────────────────────────────
 */

const AUG = Date.parse('2026-08-13T09:00:00+09:00'); // 여름
const JAN = Date.parse('2026-01-13T09:00:00+09:00'); // 겨울

test('결함에 무게가 있다 — 조사 오류가 발행을 막지는 않는다', () => {
  const r = checkPosts([ok('naver_place', '쿵더쿵는 늘 이 자리에서. 10,000원. '.repeat(6))], '쿵더쿵', { now: AUG });
  assert.ok(r.some((i) => i.rule === 'josa'), JSON.stringify(r));
  assert.equal(hasCritical(r), false, '조사는 고쳐서 내보내면 되는 것이다');
  assert.deepEqual(criticalOf(r), []);
});

test('빈 본문은 막는다', () => {
  const r = checkPosts([ok('naver_place', '   ')], '쿵더쿵', { now: AUG });
  assert.equal(hasCritical(r), true);
  assert.equal(criticalOf(r)[0].rule, 'empty');
});

/**
 * ⚠️ 이 규칙은 **한 업종의 데이터만 보면 완벽해 보인다.**
 * 카페는 반대 계절을 미리 팔 일이 거의 없어서, 카페 초안 전수로는 오탐이 하나도 안 나온다.
 * 하지만 43업종에는 "미리 파는 것이 곧 영업"인 곳이 많다 — 제과의 크리스마스 예약,
 * 설비의 한파 대비 점검, 파티룸의 송년회 예약. 계절어만 보고 막으면 그 업종은 매일 막힌다.
 * 아래는 **업종을 가정하지 않았는지**를 고정하는 테스트다.
 */
test('전수: 반대 계절을 미리 파는 것은 어느 업종이든 정상이다(오탐 방지)', () => {
  // 여름(8월)에 겨울을 말하는 정상 문장들 — 업종군을 흩어서 골랐다
  const normal: [string, string][] = [
    ['베이커리·제과', '크리스마스 케이크 사전 예약을 받습니다. 12월 물량이 조기 마감될 수 있어요.'],
    ['수리·설치', '한파 대비 배관 점검을 미리 해두시면 겨울에 고생하지 않습니다.'],
    ['파티룸·모임공간', '송년회 단체 대관 예약 문의 주세요. 12월 주말은 빠르게 찹니다.'],
    ['펜션·게스트하우스', '폭설 시즌 대비 스노체인 대여를 준비하고 있습니다.'],
    ['학원·교습소', '겨울방학 특강 모집이 곧 시작됩니다. 연말연시 일정도 함께 안내드릴 예정입니다.'],
    ['의류·패션', '첫눈 오기 전에 입을 아우터 신상이 곧 출시됩니다.'],
    ['청소·방역', '연말연시 대청소 예약을 미리 잡아두세요.'],
    ['헬스장·PT', '겨울 성수기 대비 신규 회원 사전 모집 중입니다.'],
  ];
  const missed: string[] = [];
  for (const [industry, body] of normal) {
    const r = checkPosts([ok('naver_place', `${body} `.repeat(3) + '이용료 10,000원.')], '가게이름', {
      now: AUG,
    });
    if (r.some((i) => i.rule === 'stale-season')) missed.push(industry);
  }
  assert.deepEqual(missed, [], `미리 파는 것은 정상 영업이다 — 막히면 안 되는 업종: ${missed.join(', ')}`);
});

test('전수: 계절 사전에 든 단어는 어느 것이든 "예약"이 붙으면 통과한다', () => {
  // 사전을 늘렸을 때 특정 단어만 오탐이 남는 일을 막는다 — 남은 것만 세면 빠진 게 통과로 찍힌다
  const winterWords = ['동절기', '한파', '폭설', '첫눈', '연말연시', '송년', '크리스마스', '성탄'];
  const stuck: string[] = [];
  for (const w of winterWords) {
    const body = `${w} 관련 상품 사전 예약을 받고 있습니다. `.repeat(4) + '10,000원.';
    if (checkPosts([ok('naver_place', body)], '가게이름', { now: AUG }).some((i) => i.rule === 'stale-season')) {
      stuck.push(w);
    }
  }
  assert.deepEqual(stuck, [], `예약 문맥인데 막히는 단어: ${stuck.join(', ')}`);
});

test('그래도 지금 상태로 단정하면 업종과 무관하게 막는다', () => {
  const claims = [
    '동절기에는 저녁 8시까지 영업합니다',
    '한파 특별 운영 시간으로 시행 중입니다',
    '연말연시 단축 운영을 오늘부터 적용합니다',
  ];
  for (const c of claims) {
    const r = checkPosts([ok('naver_place', `${c}. `.repeat(4) + '10,000원.')], '가게이름', { now: AUG });
    assert.ok(
      r.some((i) => i.rule === 'stale-season'),
      `잡아야 한다: "${c}" → ${JSON.stringify(r)}`,
    );
  }
});

test('8월에 "동절기"가 나가면 막는다(2026-08-13 실측 유형)', () => {
  const body =
    '동절기 영업시간을 안내드립니다. 추운 날씨에 따뜻한 차 한 잔 어떠세요. '.repeat(4) +
    '수제대추차 5,800원. 20:00에 라스트오더.';
  const r = checkPosts([ok('naver_place', body)], '쿵더쿵', { now: AUG });
  const hit = r.find((i) => i.rule === 'stale-season');
  assert.ok(hit, `잡아야 한다: ${JSON.stringify(r)}`);
  assert.equal(hit!.severity, 'critical');
  assert.match(hit!.detail, /동절기/);

  // 겨울에는 정상이다 — 계절을 무조건 잡는 규칙이 아니어야 한다
  const winter = checkPosts([ok('naver_place', body)], '쿵더쿵', { now: JAN });
  assert.ok(!winter.some((i) => i.rule === 'stale-season'), JSON.stringify(winter));
});

test('인접 계절은 잡지 않는다 — 환절기 글이 매일 결함으로 찍히면 안 된다', () => {
  // 8월(여름)에 가을을 미리 말하는 것은 자연스럽다
  const body = '곧 단풍이 물드는 계절이네요. 가을 신메뉴를 준비하고 있어요. '.repeat(4) + '아메리카노 3,500원.';
  const r = checkPosts([ok('naver_place', body)], '쿵더쿵', { now: AUG });
  assert.ok(!r.some((i) => i.rule === 'stale-season'), JSON.stringify(r));
});

test('계절 이름만으로는 잡지 않는다 — "겨울 한정 메뉴 준비 중"은 정상이다', () => {
  const body = '겨울 한정 메뉴를 준비하고 있습니다. 조금만 기다려주세요. '.repeat(4) + '아메리카노 3,500원.';
  const r = checkPosts([ok('naver_place', body)], '쿵더쿵', { now: AUG });
  assert.ok(!r.some((i) => i.rule === 'stale-season'), JSON.stringify(r));
});

test('화자가 무너진 글은 점검에서도 막는다(생성 보정만으로는 못 막았다)', () => {
  // 실제로 나갔던 문장 — 사장님 계정인데 손님처럼 말한다
  const body = '요기 아메리카노(3,500원)가 그렇게 시원하고 맛있대요. '.repeat(5);
  const r = checkPosts([ok('naver_place', body)], '쿵더쿵', { now: AUG });
  const hit = r.find((i) => i.rule === 'owner-voice');
  assert.ok(hit, `잡아야 한다: ${JSON.stringify(r)}`);
  assert.equal(hit!.severity, 'critical');

  // 사장님 본인 소감은 그대로 통과 — 좁게 잡은 규칙이 넓어지면 안 된다
  const fine = checkPosts(
    [ok('naver_place', '갓 구운 크로플을 곁들이니 이게 여름날의 행복이더라구요. '.repeat(5) + '3,500원.')],
    '쿵더쿵',
    { now: AUG },
  );
  assert.ok(!fine.some((i) => i.rule === 'owner-voice'), JSON.stringify(fine));
});

/**
 * 답글 8건이 통째로 같은 문장이었는데 통과했다(2026-08-13).
 * 원인은 규칙이 약해서가 아니라 **글을 하나씩만 봤기 때문**이다 —
 * 배열을 통째로 받아놓고 서로 비교한 적이 없으니 구조적으로 잡을 수 없었다.
 */
test('세트 안에서 같은 말을 반복하면 막는다', () => {
  const same = '정성껏 준비한 메뉴로 보답하겠습니다. 언제나 편하게 들러주세요. 오늘도 좋은 하루 보내세요.';
  const r = checkPosts(
    [ok('naver_place', same), ok('threads', same), ok('facebook', same)],
    '쿵더쿵',
    { now: AUG, storeHasFacts: false },
  );
  const dups = r.filter((i) => i.rule === 'duplicate');
  assert.equal(dups.length, 3, `3쌍 모두 잡아야: ${JSON.stringify(r)}`);
  assert.ok(dups.every((d) => d.severity === 'critical'));
});

test('답글처럼 짧은 글도 통째로 같으면 잡는다', () => {
  const dups = findDuplicates([
    { label: '답글1', text: '소중한 후기 감사합니다!' },
    { label: '답글2', text: '소중한 후기 감사합니다!' },
  ]);
  assert.equal(dups.length, 1, JSON.stringify(dups));
  assert.equal(dups[0].ratio, 1);
});

test('같은 사실이 여러 채널에 들어가는 것은 중복이 아니다(오탐 방지)', () => {
  // 가격·영업시간은 여덟 채널에 똑같이 들어가야 맞다. 이걸 잡으면 매일 결함이 뜬다.
  const facts = '수제대추차 5,800원. 20:00에 라스트오더. 043-733-6616.';
  const r = checkPosts(
    [
      ok('naver_place', `한여름 더위에 지칠 때 시원한 자리 하나 비워두었습니다. 천천히 쉬어가세요. ${facts}`),
      ok('threads', `오늘은 유난히 볕이 좋아서 창가 자리가 인기였어요. 조용히 앉아 있기 좋은 날입니다. ${facts}`),
    ],
    '쿵더쿵',
    { now: AUG },
  );
  assert.ok(!r.some((i) => i.rule === 'duplicate'), JSON.stringify(r));
});

test('정상 세트는 여전히 아무것도 잡지 않는다(전체 오탐 재확인)', () => {
  const posts = [
    ok('naver_place', '옥천 안내면에 자리한 가게에서 잠시 쉬어가세요. '.repeat(5) + '초콜릿(10,000원)과 함께요. 저녁 8시까지 영업합니다.'),
    ok('blog', '본문 '.repeat(500), '버터 향 스치는 길, 달콤한 유혹'),
  ];
  assert.deepEqual(checkPosts(posts, '쿵더쿵', { now: AUG }), []);
});
