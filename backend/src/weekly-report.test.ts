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
  assert.equal(r.stats.find((s) => s.label === '올린 글')?.value, '0');
  assert.equal(r.stats.find((s) => s.label === '준비된 글')?.value, '0');
});

/**
 * 성과 단위는 **올린 날**이다.
 * 우리는 채널마다 매일 한 개를 만들어 두고 "하루 하나만 올리면 된다"고 약속했다.
 * 만들어 둔 개수를 분모로 쓰면 약속대로 한 사장님이 "7/56 · 지나간 글 42"를 받는다.
 */
test('약속대로 매일 하나씩 올린 사장님을 실패로 적지 않는다', () => {
  const posts: ReportPost[] = [];
  for (let d = 0; d < 7; d++) {
    for (let c = 0; c < 8; c++) {
      const pub = c === 0;
      posts.push({
        created_at: ago(d),
        channel: `ch${c}`,
        published_at: pub ? ago(d) : undefined,
        status: pub ? 'published' : d === 0 ? 'draft' : 'archived',
      });
    }
  }
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.equal(r.stats.find((s) => s.label === '올린 날')?.value, '7/7');
  assert.ok(/내내|완벽/.test(r.headline), `완주를 완주라고 말해야: ${r.headline}`);
  assert.ok(!r.stats.some((s) => s.label === '지나간 글'), '공급량을 방치로 세지 않는다');
  assert.ok(
    !r.todos.some((t) => /안 올린 글/.test(t.text)),
    `하나만 하면 된다고 해놓고 나머지를 빚으로 돌려주면 안 된다: ${JSON.stringify(r.todos)}`,
  );
});

test('올린 날이 모자라면 정직하게 적되 개수로 몰아세우지 않는다', () => {
  const posts: ReportPost[] = [];
  for (let d = 0; d < 7; d++) {
    for (let c = 0; c < 8; c++) {
      const pub = c === 0 && [1, 3, 5].includes(d);
      posts.push({
        created_at: ago(d),
        channel: `ch${c}`,
        published_at: pub ? ago(d) : undefined,
        status: pub ? 'published' : d === 0 ? 'draft' : 'archived',
      });
    }
  }
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.equal(r.stats.find((s) => s.label === '올린 날')?.value, '3/7');
  assert.ok(r.headline.includes('3일'), `며칠 했는지 말해야: ${r.headline}`);
  const nudge = r.todos.find((t) => t.text.includes('하나만'));
  assert.ok(nudge, `오늘 안 올렸으면 하나를 권해야: ${JSON.stringify(r.todos)}`);
  assert.ok(!/\d+개/.test(nudge!.text), `남은 개수를 들이밀지 않는다: ${nudge!.text}`);
});

test('오늘 이미 올렸으면 더 올리라고 하지 않는다', () => {
  const posts: ReportPost[] = [
    { created_at: ago(0), channel: 'blog', published_at: ago(0), status: 'published' },
    { created_at: ago(0), channel: 'instagram', status: 'draft' },
    { created_at: ago(0), channel: 'threads', status: 'draft' },
  ];
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.ok(!r.todos.some((t) => t.text.includes('하나만')), `오늘 몫은 끝났다: ${JSON.stringify(r.todos)}`);
});

test('부풀림 방지: 준비된 개수와 올린 개수를 함께 보여준다', () => {
  // 예전 문제 — "준비 5 / 안 올린 글 1"만 남으면 4개가 발행된 것처럼 읽힌다.
  const posts: ReportPost[] = [
    { created_at: ago(0), channel: 'blog', status: 'draft' },
    { created_at: ago(1), channel: 'blog', status: 'archived' },
    { created_at: ago(2), channel: 'blog', status: 'archived' },
    { created_at: ago(3), channel: 'blog', status: 'archived' },
    { created_at: ago(4), channel: 'blog', status: 'archived' },
  ];
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.equal(r.stats.find((s) => s.label === '준비된 글')?.value, '5');
  assert.equal(r.stats.find((s) => s.label === '올린 글')?.value, '0');
  assert.equal(r.stats.find((s) => s.label === '올린 날')?.value, '0/7');
  assert.ok(!/올리셨어요/.test(r.headline), `안 올렸으면 올렸다고 하면 안 된다: ${r.headline}`);
});

test('7일 윈도우: 8일 전 데이터는 이번 주에 안 들어간다', () => {
  const posts: ReportPost[] = [
    { created_at: ago(1), channel: 'blog', status: 'draft' },
    { created_at: ago(8), channel: 'blog', status: 'draft' }, // 범위 밖
  ];
  const r = buildWeeklyReport('가게', posts, [], NOW);
  assert.equal(r.stats.find((s) => s.label === '준비된 글')?.value, '1', '이번 주만 집계');
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

test("'새 리뷰'는 손님이 남긴 날 기준 — 늦게 긁어온 과거 리뷰를 이번 주로 세지 않는다", () => {
  // 실측(2026-08-12 스타일링룸): 실제 이번 주 2건인데 12건으로 보고되고 있었다.
  // 첫 크롤에서 과거 리뷰가 전부 crawled_at=오늘로 들어오기 때문. 그 숫자가 카톡으로 나간다.
  const reviews: ReportReview[] = [
    { posted_at: ago(1), crawled_at: ago(0), sentiment: 'positive' },
    { posted_at: ago(3), crawled_at: ago(0), sentiment: 'positive' },
    { posted_at: ago(20), crawled_at: ago(0), sentiment: 'negative' }, // 20일 전 글을 오늘 수집
    { posted_at: ago(43), crawled_at: ago(0), sentiment: 'positive' },
  ];
  const r = buildWeeklyReport('가게', [], reviews, NOW);
  assert.equal(r.stats.find((s) => s.label === '새 리뷰')?.value, '2', '이번 주에 올라온 2건만');
  assert.ok(!/이번 주 리뷰 4건/.test(r.headline), `과거 리뷰를 이번 주로 세면 안 된다: ${r.headline}`);
});

test('posted_at이 없으면 crawled_at으로 떨어진다(구 데이터 호환)', () => {
  const reviews: ReportReview[] = [
    { crawled_at: ago(1), sentiment: 'positive' },
    { crawled_at: ago(9), sentiment: 'negative' },
  ];
  const r = buildWeeklyReport('가게', [], reviews, NOW);
  assert.equal(r.stats.find((s) => s.label === '새 리뷰')?.value, '1');
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
