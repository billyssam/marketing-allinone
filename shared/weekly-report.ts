/**
 * 주간 리포트 — 사장님이 10초 안에 "이번 주 이렇게 됐구나"를 느끼게 하는 요약.
 *
 * 왜 필요한가: 대시보드는 "오늘 할 일"을 보여주지만, 자동화의 가치는 **누적**으로 느껴진다.
 * 매일 조금씩 되는 일은 체감이 안 돼서 사장님이 "이거 효과 있나?" 하고 이탈한다.
 * 파일럿 유지율이 곧 이 제품의 생존이라, 일주일치를 문장으로 되돌려주는 화면이 필요하다.
 *
 * 설계 원칙
 * - **없는 성과를 지어내지 않는다.** 도달·조회 같은 미연동 지표는 아예 언급하지 않고,
 *   한 일이 없으면 없다고 쓴다(과장하면 첫 주에 신뢰를 잃는다).
 * - **업종 무관.** 음식 어휘를 쓰지 않는다 — 미용실·헬스장·학원도 그대로 읽힌다.
 * - 숫자로 끝내지 않고 **다음 행동**으로 연결한다(미발행 초안·미답변 리뷰).
 */

export interface ReportPost {
  created_at: string;
  published_at?: string | null;
  status?: string | null;
  channel: string;
}

export interface ReportReview {
  crawled_at?: string | null;
  posted_at?: string | null;
  sentiment?: string | null;
  reply_sent_at?: string | null;
}

export interface ReportStat {
  label: string;
  value: string;
  /** 보조 설명 — 숫자만으론 의미가 안 잡히는 지표에만 */
  sub?: string;
}

export interface ReportTodo {
  text: string;
  href: string;
  /** 급한 것(부정 리뷰 등)은 강조 */
  urgent?: boolean;
}

export interface WeeklyReport {
  periodLabel: string;
  /** 한 줄 요약 — 이번 주를 문장으로 */
  headline: string;
  stats: ReportStat[];
  /** 칭찬할 만한 것(있을 때만) */
  wins: string[];
  /** 놓친 것 → 다음 행동 */
  todos: ReportTodo[];
  /** 카톡·메모로 옮길 수 있는 평문 */
  plainText: string;
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** KST 기준 오늘 자정(00:00)의 UTC ms */
function kstMidnight(nowMs: number): number {
  return Math.floor((nowMs + KST) / DAY) * DAY - KST;
}

function kstDateLabel(ms: number): string {
  const d = new Date(ms + KST);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/**
 * 최근 7일(오늘 포함) 집계.
 * @param nowMs 기준 시각 — 테스트에서 고정할 수 있도록 주입받는다
 */
/** 플레이스에 표시된 리뷰 총량 기록(정확한 수치만 쌓인다) */
export interface ReviewCountPoint {
  at: string;
  count: number;
}

export function buildWeeklyReport(
  storeName: string,
  posts: ReportPost[],
  reviews: ReportReview[],
  nowMs: number,
  opts: { reviewHistory?: ReviewCountPoint[] } = {},
): WeeklyReport {
  const start = kstMidnight(nowMs) - 6 * DAY;
  const inWindow = (iso?: string | null) => !!iso && Date.parse(iso) >= start;

  const weekPosts = posts.filter((p) => inWindow(p.created_at));
  const published = weekPosts.filter((p) => p.published_at || p.status === 'published');
  const waiting = posts.filter((p) => (p.status ?? 'draft') === 'draft' && !p.published_at);
  // 크론이 어제치 미발행 초안을 매일 보관 처리한다 → 안 올리면 그냥 지나간다.
  // 이걸 안 보여주면 "준비 28 / 안 올린 글 4"만 남아 24개가 발행된 것처럼 읽힌다(실측).
  const expired = weekPosts.filter((p) => p.status === 'archived' && !p.published_at);

  const weekReviews = reviews.filter((r) => inWindow(r.crawled_at ?? r.posted_at));
  const positive = weekReviews.filter((r) => r.sentiment === 'positive');
  const negative = weekReviews.filter((r) => r.sentiment === 'negative');
  const unreplied = reviews.filter((r) => !r.reply_sent_at);
  const repliedThisWeek = reviews.filter((r) => inWindow(r.reply_sent_at));

  const periodLabel = `${kstDateLabel(start)} ~ ${kstDateLabel(kstMidnight(nowMs))}`;

  // ── 한 줄 요약 ──
  // 과장 금지: 한 게 없으면 없다고 쓰되, 다음 행동은 반드시 제시한다.
  let headline: string;
  if (weekPosts.length === 0 && weekReviews.length === 0) {
    headline = '이번 주는 아직 쌓인 게 없어요. 채널을 연결해두시면 내일 아침부터 글이 준비됩니다.';
  } else if (published.length > 0) {
    headline = `이번 주 글 ${weekPosts.length}개가 준비됐고, ${published.length}개를 올리셨어요.`;
  } else if (weekPosts.length > 0) {
    headline = `이번 주 글 ${weekPosts.length}개가 준비돼 있어요. 아직 올리신 건 없습니다.`;
  } else {
    headline = `이번 주 리뷰 ${weekReviews.length}건이 새로 들어왔어요.`;
  }

  // ── 숫자 ──
  const stats: ReportStat[] = [
    { label: '준비된 글', value: `${weekPosts.length}`, sub: weekPosts.length ? '매일 아침 자동' : undefined },
    { label: '올린 글', value: `${published.length}` },
  ];
  if (expired.length > 0) {
    stats.push({ label: '지나간 글', value: `${expired.length}`, sub: '안 올려서 보관됨' });
  }
  stats.push({ label: '새 리뷰', value: `${weekReviews.length}` });
  if (weekReviews.length > 0) {
    const rate = Math.round((positive.length / weekReviews.length) * 100);
    stats.push({ label: '긍정 비율', value: `${rate}%`, sub: `긍정 ${positive.length} · 부정 ${negative.length}` });
  }
  if (repliedThisWeek.length > 0) {
    stats.push({ label: '단 답글', value: `${repliedThisWeek.length}` });
  }

  // ── 네이버 리뷰 총량 ──
  // 우리가 크롤한 표본(최신 20건)이 아니라 플레이스에 표시된 **실제 총량**이라
  // "리뷰 늘었나?"에 정직하게 답할 수 있는 유일한 지표다.
  // 축약 표기("1.5만")는 애초에 기록에서 빠지므로 여기 오는 값은 전부 정확한 수치다.
  const history = (opts.reviewHistory ?? []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latest = history[history.length - 1];
  const prior = history.length >= 2 ? history[history.length - 2] : undefined;
  let reviewGrowth: number | undefined;
  if (latest && prior) {
    const diff = latest.count - prior.count;
    // 줄어든 건 알리지 않는다 — 리뷰 삭제·크롤 오차로도 줄 수 있고, 사장님이 어쩔 수 없는 일이다
    if (diff > 0) reviewGrowth = diff;
  }
  if (latest) {
    stats.push({
      label: '네이버 리뷰',
      value: `${latest.count.toLocaleString()}`,
      sub: reviewGrowth ? `지난 기록보다 +${reviewGrowth}` : '가게 전체 누적',
    });
  }

  // ── 잘된 것 ──
  const wins: string[] = [];
  if (reviewGrowth) {
    wins.push(`네이버 리뷰가 ${reviewGrowth}건 늘었어요. 지금 ${latest!.count.toLocaleString()}건입니다.`);
  }
  if (published.length >= 3) wins.push(`한 주에 ${published.length}번 올리셨어요. 이 속도면 노출이 쌓입니다.`);
  else if (published.length > 0) wins.push(`${published.length}개 올리셨어요. 주 3회를 넘기면 검색 노출이 확실히 달라집니다.`);
  if (weekReviews.length > 0 && negative.length === 0) {
    wins.push(`이번 주 부정 리뷰가 한 건도 없었어요.`);
  }
  if (repliedThisWeek.length > 0) {
    wins.push(`답글 ${repliedThisWeek.length}건을 다셨어요. 답글 단 가게는 다음 손님이 더 신뢰합니다.`);
  }
  const channels = new Set(weekPosts.map((p) => p.channel));
  if (channels.size >= 2) wins.push(`${channels.size}개 채널에 맞춰 글이 각각 준비됐어요.`);

  // ── 다음 행동 ──
  const todos: ReportTodo[] = [];
  if (negative.length > 0) {
    const n = negative.filter((r) => !r.reply_sent_at).length;
    if (n > 0) todos.push({ text: `부정 리뷰 ${n}건에 답글이 아직 없어요`, href: '/reviews', urgent: true });
  }
  const unrepliedCount = unreplied.length - negative.filter((r) => !r.reply_sent_at).length;
  if (unrepliedCount > 0) todos.push({ text: `답글 안 단 리뷰 ${unrepliedCount}건`, href: '/reviews' });
  if (waiting.length > 0) todos.push({ text: `아직 안 올린 글 ${waiting.length}개`, href: '/posts' });

  return { periodLabel, headline, stats, wins, todos, plainText: toPlainText(storeName, periodLabel, headline, stats, wins, todos) };
}

/** 카톡·메모로 그대로 옮길 수 있는 평문 (사장님이 직접 공유하거나 운영자가 확인용으로 씀) */
function toPlainText(
  storeName: string,
  periodLabel: string,
  headline: string,
  stats: ReportStat[],
  wins: string[],
  todos: ReportTodo[],
): string {
  const lines = [`[${storeName}] 주간 리포트 · ${periodLabel}`, '', headline, ''];
  lines.push(stats.map((s) => `${s.label} ${s.value}`).join(' · '));
  if (wins.length) {
    lines.push('', '잘된 것');
    for (const w of wins) lines.push(`· ${w}`);
  }
  if (todos.length) {
    lines.push('', '다음에 하실 것');
    for (const t of todos) lines.push(`· ${t.text}`);
  }
  return lines.join('\n');
}
