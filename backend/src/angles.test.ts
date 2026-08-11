/**
 * 콘텐츠 각도 로테이션 회귀 테스트.
 * 실행: npx tsx --test src/angles.test.ts
 * 핵심: 연속된 날은 다른 각도(반복 방지) + 프롬프트에 실제로 각도가 들어간다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleFor, kstDayNumber, anglesForOffering, dailyDirective, weekPlan, titleStyleFor, repeatedTitleWords, titleDirective, recentFirstWords } from '../../shared/content-engine/angles.js';
import { getIndustryPrompt } from '../../shared/content-engine/registry.js';
import type { DraftInput } from '../../shared/content-engine/types.js';

test('연속된 날은 다른 각도(반복 방지)', () => {
  const store = 'store-abc';
  for (let d = 1000; d < 1010; d++) {
    const a = angleFor('menu', store, d);
    const b = angleFor('menu', store, d + 1);
    assert.notEqual(a.key, b.key, `day ${d}→${d + 1} 각도 달라야`);
  }
});

test('결정적 — 같은 (매장·날짜)는 같은 각도', () => {
  assert.equal(angleFor('service', 's1', 5000).key, angleFor('service', 's1', 5000).key);
});

test('매장별로 같은 날 각도가 갈린다(대부분)', () => {
  const day = 5000;
  const keys = ['a', 'b', 'c', 'd', 'e'].map((s) => angleFor('menu', `store-${s}`, day).key);
  assert.ok(new Set(keys).size >= 2, '매장 시드로 분산');
});

test('offering별 각도가 그 성격에 맞음', () => {
  assert.ok(anglesForOffering('menu').some((a) => a.key === 'signature'));
  assert.ok(anglesForOffering('product').some((a) => a.key === 'spotlight'));
  assert.ok(anglesForOffering('service').some((a) => a.key === 'result'));
  assert.ok(anglesForOffering('booking').some((a) => a.key === 'firstvisit'));
});

test('선택된 각도가 실제 planning 프롬프트에 들어간다(Gemini 없이)', () => {
  const angle = angleFor('menu', 'store-x', 5000);
  const input: DraftInput = {
    store: { id: 'store-x', name: '테스트카페', industryId: 'cafe', brandTone: {} },
    photos: [],
    targetLength: 'medium',
    angle: angle.directive,
  };
  const prompt = getIndustryPrompt('cafe').planningTemplate(input);
  assert.ok(prompt.includes(angle.directive), '각도 directive가 프롬프트에 포함');
});

test('dailyDirective: 중심 소재가 매일 로테이션(같은 메뉴 반복 방지)', () => {
  const menu = ['수제대추차', '눈꽃빙수', '쿵더쿵초콜릿', '플레인크로플'];
  const store = 'store-z';
  const base = Date.parse('2026-07-01T08:00:00+09:00');
  const DAY = 86_400_000;
  const feats = [0, 1, 2, 3].map((i) => dailyDirective('menu', store, base + i * DAY, menu).featured);
  // 연속 4일에 4개 메뉴가 겹치지 않고 다 나옴
  assert.equal(new Set(feats).size, 4, `소재 변주: ${feats.join(',')}`);
  // featured가 실제 메뉴 중 하나 + 지시문에 포함
  const one = dailyDirective('menu', store, base, menu);
  assert.ok(menu.includes(one.featured!));
  assert.ok(one.directive.includes(one.featured!));
});

test('dailyDirective: 소재 없으면 featured 없음(방어)', () => {
  const d = dailyDirective('service', 's', Date.parse('2026-07-01T08:00:00+09:00'), []);
  assert.equal(d.featured, undefined);
  assert.ok(d.directive.length > 0);
});

test('kstDayNumber는 하루 지나면 +1', () => {
  const base = Date.parse('2026-07-21T05:00:00+09:00');
  assert.equal(kstDayNumber(base + 86_400_000) - kstDayNumber(base), 1);
});

test('lengthForAngle: 각도 성격별 길이', () => {
  const base = Date.parse('2026-07-01T08:00:00+09:00'); const DAY=86_400_000;
  // 여러 날 돌려 long/short/medium 모두 등장하는지
  const lens = new Set();
  for (let i=0;i<10;i++) lens.add(dailyDirective('menu','store-len',base+i*DAY,[]).length);
  assert.ok(lens.has('long') && lens.has('short'), `길이 변주: ${[...lens].join(',')}`);
});

test('titleStyleFor: 연속된 날은 다른 제목 구조 + 6일 주기로 전체 순환', () => {
  const store = 'store-title';
  const keys = new Set();
  for (let d = 2000; d < 2006; d++) {
    const a = titleStyleFor(store, d);
    const b = titleStyleFor(store, d + 1);
    assert.notEqual(a.key, b.key, `day ${d}→${d + 1} 제목 구조 달라야`);
    keys.add(a.key);
  }
  assert.equal(keys.size, 6, '6일이면 6개 구조 전부 등장');
});

test('dailyDirective: 제목 지시는 directive(기획용)에 넣지 않는다 — 본문 단계 유실 방지', () => {
  const d = dailyDirective('menu', 'store-t', Date.parse('2026-07-23T08:00:00+09:00'), []);
  assert.ok(!d.directive.includes('제목'), 'directive에 제목 지시 없음(titleRule로 분리)');
  assert.ok(d.titleStyle.key.length > 0, 'titleStyle은 별도 반환');
});

test('titleDirective: 규칙·예시·금지 프리픽스를 모두 포함', () => {
  const style = titleStyleFor('store-td', 1000);
  const t = titleDirective(style, '쿵더쿵', ['쉼표', '따뜻한']);
  assert.ok(t.includes(style.rule), '규칙 포함');
  assert.ok(t.includes(style.example.menu), 'few-shot 예시 포함');
  assert.ok(t.includes('쿵더쿵'), '상호 프리픽스 금지 명시');
  assert.ok(t.includes('쉼표') && t.includes('따뜻한'), '금지 시어 포함');
});

test('titleDirective: 첫 어절 제약을 구체적으로 명시(추상 금지로는 안 막힘)', () => {
  // 실측: "상호로 시작 금지"만으론 number 스타일에서 "옥천 안내면 쿵더쿵, 20시…"가 나왔다
  const nonPlain = [0, 1, 2, 3, 4, 5].map((d) => titleStyleFor('s', d)).find((s) => s.key !== 'plain')!;
  const t = titleDirective(nonPlain, '쿵더쿵');
  assert.ok(t.includes('첫 두 어절'), '첫 어절 제약 명시');
  assert.ok(t.includes('실패한 제목'), '위반 시 실패임을 명시');
});

test('titleDirective: 계절을 주면 제목에도 못박는다(다른 계절 누출 방지)', () => {
  const style = titleStyleFor('store-se', 500);
  const withSeason = titleDirective(style, '쿵더쿵', [], '7월 여름');
  assert.ok(withSeason.includes('7월 여름'), '현재 계절 명시');
  assert.ok(withSeason.includes('다른 계절 언급 금지'), '타 계절 금지');
  assert.ok(!titleDirective(style, '쿵더쿵').includes('계절'), '미지정 시 계절 문구 없음');
});

test('titleDirective: plain 스타일만 상호 시작 허용', () => {
  const ex = { menu: 'e', product: 'e', service: 'e', booking: 'e' };
  const plain = { key: 'plain', rule: 'r', example: ex };
  const other = { key: 'question', rule: 'r', example: ex };
  assert.ok(titleDirective(plain, '가게').includes('상호로 시작해도 됨'), 'plain은 예외 안내');
  assert.ok(!titleDirective(other, '가게').includes('상호로 시작해도 됨'), '다른 스타일은 금지 유지');
});

test('첫 어절 관성: 최근에 쓴 시작 단어를 구체적으로 금지한다', () => {
  // 실측(8/11): 30건 중 16건이 '옥천'으로 시작. "첫 두 어절에 지역명 금지"라는 추상 규칙은
  // 안 지켜졌고, 지역명 자체는 SEO상 제목에 있어야 해서 금지어로 뺄 수도 없다.
  const titles = [
    '옥천 안내면 쿵더쿵의 여름',
    '옥천에서 만난 달콤한 위로',
    '버터 향 스치는 길, 쿵더쿵',
    '옥천 쿵더쿵, 오늘의 한 잔',
  ];
  const starts = recentFirstWords(titles);
  assert.deepEqual(starts, ['옥천', '버터'], `첫 어절만 중복 없이: ${JSON.stringify(starts)}`);

  const style = titleStyleFor('s-start', 1);
  const t = titleDirective(style, '쿵더쿵', [], undefined, 'menu', starts);
  assert.ok(t.includes('시작**하지 말 것'), t);
  assert.ok(t.includes('옥천'), '구체 단어가 들어가야');
  assert.ok(t.includes('문장 중간·뒤에 넣는 건 괜찮다'), '지역명 자체를 막으면 SEO 손해');

  // 안 넘기면 해당 문구가 없어야(기존 호출부 무영향)
  assert.ok(!titleDirective(style, '쿵더쿵').includes('시작**하지 말 것'));
});

test('첫 어절 수집: 상한을 지키고 짧은 조각은 버린다', () => {
  const many = ['가게 하나', '나무 둘', '다리 셋', '라면 넷', '마루 다섯', '바다 여섯', '사과 일곱'];
  assert.equal(recentFirstWords(many, 3).length, 3, '상한');
  assert.deepEqual(recentFirstWords(['A 짧음', '옥천 정상']), ['옥천'], '1글자 첫 어절은 제외');
});

test('범용성: 제목 few-shot 예시가 업종(offering)별로 갈린다', () => {
  // 예시 하나를 전 업종에 쓰면 카페 예시가 미용실·헬스장 글까지 끌어당긴다.
  // 자영업 43업종 중 음식은 일부일 뿐이라 나머지가 계속 남의 옷을 입게 된다.
  for (const d of [0, 1, 2, 3, 4, 5]) {
    const style = titleStyleFor('s-offering', d);
    const kinds = ['menu', 'product', 'service', 'booking'] as const;
    const shown = kinds.map((k) => titleDirective(style, '가게', [], undefined, k));
    // 업종마다 실제로 다른 예시가 들어가야 한다
    assert.equal(new Set(shown).size, kinds.length, `${style.key}: 업종별 예시가 달라야`);
    // 비음식 업종 예시에 음식 어휘가 새면 안 된다
    for (const k of ['product', 'service', 'booking'] as const) {
      const t = style.example[k];
      assert.ok(!/메뉴|빙수|크로플|대추차|한 잔/.test(t), `${style.key}/${k} 음식 어휘 누출: ${t}`);
    }
  }
});

test('titleStyle.check: question·number는 형식 판정기를 갖는다(검증 가능성)', () => {
  const styles = [0, 1, 2, 3, 4, 5].map((i) => titleStyleFor('s', i));
  const q = styles.find((s) => s.key === 'question')!;
  const n = styles.find((s) => s.key === 'number')!;
  assert.ok(q.check!('오늘 어디 갈까요?'), '물음표 통과');
  assert.ok(!q.check!('오늘은 여기입니다'), '물음표 없으면 실패');
  assert.ok(n.check!('세 가지 이유'), '한글 수사 통과');
  assert.ok(n.check!('5분이면 충분'), '아라비아 숫자 통과');
  assert.ok(!n.check!('맛있는 커피 한잔의 여유'), '숫자 없으면 실패');
});

test('repeatedTitleWords: 실제 반복 이력에서 시어 추출 + 상호·지역 제외', () => {
  const titles = [
    '옥천 안내면 쿵더쿵, 여름날의 시원한 쉼표',
    '옥천 안내면 쿵더쿵, 여름날의 달콤한 쉼표',
    '옥천 안내면 카페 쿵더쿵, 바쁜 일상 속 따뜻한 쉼표',
    '옥천 안내면 쿵더쿵, 따뜻한 온기로 채우는 쉼표',
  ];
  const banned = repeatedTitleWords(titles, ['쿵더쿵', '충북 옥천군 안내면 현리3길']);
  assert.ok(banned.includes('쉼표'), `'쉼표' 금지: ${banned.join(',')}`);
  assert.ok(banned.includes('따뜻한'), `'따뜻한' 금지`);
  assert.ok(banned.includes('여름날의'), `'여름날의' 금지`);
  assert.ok(!banned.includes('쿵더쿵'), '상호는 금지 안 함');
  assert.ok(!banned.includes('옥천'), '지역명은 금지 안 함(SEO)');
});

test('repeatedTitleWords: 1회만 쓰인 단어도 금지(2회째 반복을 미리 차단)', () => {
  // 실측 근거: '위로'가 2회째에 비로소 금지돼 7일 중 3회 등장했다
  const banned = repeatedTitleWords(['여름날의 특별한 위로', '전혀 다른 문장 구조'], ['쿵더쿵']);
  assert.ok(banned.includes('위로'), `1회 등장어도 금지: ${banned.join(',')}`);
});

test('repeatedTitleWords: 금지 목록 상한(프롬프트 비대 방지)', () => {
  const many = Array.from({ length: 10 }, (_, i) => `단어${i}가 들어간 아주 긴 제목 문장 사례 ${i}`);
  assert.ok(repeatedTitleWords(many, []).length <= 14, '상한 14개');
});

test('repeatedTitleWords: 제목 없으면 빈 배열', () => {
  assert.deepEqual(repeatedTitleWords([], []), []);
});

test('weekPlan: N일 계획이 매일 다른 각도(대부분)', () => {
  const base=Date.parse('2026-07-22T08:00:00+09:00');
  const plan=weekPlan('menu','store-wp',['A','B','C','D','E'],base,5);
  assert.equal(plan.length,5);
  assert.equal(plan[0].dayOffset,0);
  // 5일 각도가 최소 4종(사실상 매일 다름)
  assert.ok(new Set(plan.map(p=>p.angleLabel)).size>=4);
  // 중심소재도 변주
  assert.ok(new Set(plan.map(p=>p.featured)).size>=4);
});
