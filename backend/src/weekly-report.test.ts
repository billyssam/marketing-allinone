/**
 * 주간 리포트 회귀 테스트 (무의존 · Node 내장 test 러너).
 * 실행: npx tsx --test src/weekly-report.test.ts
 *
 * 이 화면은 사장님이 "계속 쓸지" 판단하는 근거라, 과장 한 번이면 신뢰가 깨진다.
 * 그래서 "없는 성과를 지어내지 않는다"를 테스트로 못박는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, type ReportPost, type ReportReview } from '../../shared/weekly-report.js';

const NOW = Date.parse('2026-08-05T03:00:00Z'); // KST 8/5 12:00
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

test('빈 데이터: 성과를 지어내지 않고 다음 행동을 안내한다', () => {
  const r = buildWeeklyReport('가게', [], [], NOW);
  assert.ok(!/\d+개를 올리셨/.test(r.headline), '없는 발행을 말하면 안 됨');
  assert.ok(r.headline.includes('아직'), '없으면 없다고 말해야');
  assert.equal(r.wins.length, 0, '칭찬할 게 없으면 비어야');
  assert.ok(r.stats.every((s) => s.value === '0'), '모든 수치 0');
});

test('발행이 있으면 준비·발행 수를 정확히 말한다', () => {
  const posts: ReportPost[] = [
    { created_at: ago(1), channel: 'blog', published_at: ago(1), status: 'published' },
    { created_at: ago(2), channel: 'instagram', status: 'draft' },
    { created_at: ago(3), channel: 'blog', status: 'draft' },
  ];
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.ok(r.headline.includes('3개'), `준비 3: ${r.headline}`);
  assert.ok(r.headline.includes('1개'), `발행 1: ${r.headline}`);
  assert.equal(r.stats.find((s) => s.label === '준비된 글')?.value, '3');
  assert.equal(r.stats.find((s) => s.label === '올린 글')?.value, '1');
  assert.ok(r.todos.some((t) => t.text.includes('안 올린 글 2')), `미발행 2건 안내: ${JSON.stringify(r.todos)}`);
});

test('안 올려서 지나간 글을 숨기지 않는다', () => {
  // 크론이 어제치 미발행 초안을 매일 보관 처리한다. 이걸 안 보여주면
  // "준비 5 / 안 올린 글 1"만 남아 4개가 발행된 것처럼 읽힌다(실측에서 나온 문제).
  const posts: ReportPost[] = [
    { created_at: ago(0), channel: 'blog', status: 'draft' },
    { created_at: ago(1), channel: 'blog', status: 'archived' },
    { created_at: ago(2), channel: 'blog', status: 'archived' },
    { created_at: ago(3), channel: 'blog', status: 'archived' },
    { created_at: ago(4), channel: 'blog', status: 'archived' },
  ];
  const r = buildWeeklyReport('가게', posts, [], NOW);
  const expired = r.stats.find((s) => s.label === '지나간 글');
  assert.ok(expired, `지나간 글이 표시돼야: ${JSON.stringify(r.stats)}`);
  assert.equal(expired!.value, '4');
  assert.equal(r.stats.find((s) => s.label === '올린 글')?.value, '0');
  // 발행된 글은 "지나간 글"에 포함되면 안 된다
  const withPub: ReportPost[] = [{ created_at: ago(1), channel: 'blog', status: 'archived', published_at: ago(1) }];
  const r2 = buildWeeklyReport('가게', withPub, [], NOW);
  assert.ok(!r2.stats.some((s) => s.label === '지나간 글'), '발행된 글은 지나간 게 아니다');
});

test('7일 윈도우: 8일 전 데이터는 이번 주에 안 들어간다', () => {
  const posts: ReportPost[] = [
    { created_at: ago(1), channel: 'blog', status: 'draft' },
    { created_at: ago(8), channel: 'blog', status: 'draft' }, // 범위 밖
  ];
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.equal(r.stats.find((s) => s.label === '준비된 글')?.value, '1', '이번 주만 집계');
  // 다만 "안 올린 글"은 기간과 무관하게 쌓인 전체가 행동 대상이다
  assert.ok(r.todos.some((t) => t.text.includes('안 올린 글 2')), '미발행은 누적 기준');
});

test('부정 리뷰 미답변은 급한 항목으로 올라온다', () => {
  const reviews: ReportReview[] = [
    { crawled_at: ago(1), sentiment: 'negative' },
    { crawled_at: ago(1), sentiment: 'positive', reply_sent_at: ago(1) },
    { crawled_at: ago(2), sentiment: 'positive' },
  ];
  const r = buildWeeklyReport('가게', [], reviews, NOW);
  const urgent = r.todos.find((t) => t.urgent);
  assert.ok(urgent, '급한 항목이 있어야');
  assert.ok(urgent!.text.includes('부정 리뷰 1건'), urgent!.text);
  assert.equal(urgent!.href, '/reviews');
  // 부정이 있으면 "부정 없음" 칭찬은 나오면 안 된다
  assert.ok(!r.wins.some((w) => w.includes('부정 리뷰가 한 건도')), '모순된 칭찬 금지');
  // 답글 안 단 리뷰(부정 제외분)도 별도로 잡힌다
  assert.ok(r.todos.some((t) => !t.urgent && t.text.includes('답글 안 단 리뷰 1건')), JSON.stringify(r.todos));
});

test('긍정 비율은 이번 주 리뷰 기준으로 계산된다', () => {
  const reviews: ReportReview[] = [
    { crawled_at: ago(1), sentiment: 'positive' },
    { crawled_at: ago(1), sentiment: 'positive' },
    { crawled_at: ago(2), sentiment: 'negative' },
    { crawled_at: ago(9), sentiment: 'negative' }, // 범위 밖 — 비율에 영향 없어야
  ];
  const r = buildWeeklyReport('가게', [], reviews, NOW);
  assert.equal(r.stats.find((s) => s.label === '긍정 비율')?.value, '67%');
  assert.equal(r.stats.find((s) => s.label === '새 리뷰')?.value, '3');
});

test('범용성: 업종을 가정하는 어휘를 쓰지 않는다', () => {
  // 미용실·헬스장·학원 사장님이 읽어도 어색하지 않아야 한다
  const posts: ReportPost[] = [
    { created_at: ago(1), channel: 'blog', published_at: ago(1), status: 'published' },
    { created_at: ago(2), channel: 'instagram', published_at: ago(2), status: 'published' },
    { created_at: ago(3), channel: 'blog', published_at: ago(3), status: 'published' },
  ];
  const reviews: ReportReview[] = [{ crawled_at: ago(1), sentiment: 'positive', reply_sent_at: ago(1) }];
  const r = buildWeeklyReport('스타일링룸', posts, reviews, NOW);
  const all = [r.headline, ...r.wins, ...r.todos.map((t) => t.text), r.plainText].join(' ');
  assert.ok(!/메뉴|맛|음식|드시|커피|음료|손님상/.test(all), `업종 가정 어휘 누출: ${all}`);
});

test('네이버 리뷰 총량: 기록이 1개뿐이면 증감을 말하지 않는다', () => {
  const r = buildWeeklyReport('가게', [], [], NOW, { reviewHistory: [{ at: ago(3), count: 280 }] });
  const stat = r.stats.find((s) => s.label === '네이버 리뷰');
  assert.equal(stat?.value, '280');
  assert.equal(stat?.sub, '가게 전체 누적', '비교 대상이 없으면 증감 문구 금지');
  assert.ok(!r.wins.some((w) => /늘었어요/.test(w)));
});

test('네이버 리뷰 총량: 늘었을 때만 성과로 말한다', () => {
  const up = buildWeeklyReport('가게', [], [], NOW, {
    reviewHistory: [{ at: ago(10), count: 274 }, { at: ago(3), count: 280 }],
  });
  assert.ok(up.wins.some((w) => w.includes('6건 늘었어요')), JSON.stringify(up.wins));
  assert.equal(up.stats.find((s) => s.label === '네이버 리뷰')?.sub, '지난 기록보다 +6');

  // 줄어든 건 알리지 않는다 — 리뷰 삭제·크롤 오차로도 줄 수 있고 사장님이 어쩔 수 없다
  const down = buildWeeklyReport('가게', [], [], NOW, {
    reviewHistory: [{ at: ago(10), count: 280 }, { at: ago(3), count: 274 }],
  });
  assert.ok(!down.wins.some((w) => /리뷰가/.test(w)), JSON.stringify(down.wins));
  assert.equal(down.stats.find((s) => s.label === '네이버 리뷰')?.sub, '가게 전체 누적');
});

test('네이버 리뷰 총량: 기록이 없으면 항목 자체를 만들지 않는다', () => {
  const r = buildWeeklyReport('가게', [], [], NOW);
  assert.ok(!r.stats.some((s) => s.label === '네이버 리뷰'), '없는 지표를 지어내지 않는다');
});

test('평문은 카톡에 그대로 붙여넣을 수 있는 형태다', () => {
  const posts: ReportPost[] = [{ created_at: ago(1), channel: 'blog', published_at: ago(1), status: 'published' }];
  const r = buildWeeklyReport('쿵더쿵', posts, [], NOW);
  assert.ok(r.plainText.startsWith('[쿵더쿵] 주간 리포트'), r.plainText.slice(0, 40));
  assert.ok(r.plainText.includes(r.headline), '요약 포함');
  assert.ok(!r.plainText.includes('<'), 'HTML 태그 없음');
  assert.ok(r.plainText.split('\n').length >= 4, '읽을 수 있는 줄바꿈');
});
