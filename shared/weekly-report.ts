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

  /**
   * **올린 날 수**가 이 서비스의 성과 단위다.
   *
   * 우리는 채널마다 매일 한 개씩 만들어 두고, 사장님께는 "하루 하나만 올리면 된다"고 약속했다.
   * 그런데 리포트가 만들어 둔 개수를 분모로 쓰는 바람에, **약속대로 매일 하나씩 올린 사장님**이
   *   "56개가 준비됐고 7개를 올리셨어요 · 지나간 글 42 · 아직 안 올린 글 7개"
   * 를 받았다(2026-08-13 시뮬레이션). 완벽한 한 주가 7/56에 42개 방치로 읽힌다.
   * 우리 **공급량을 사장님 숙제로 센 것**이고, 파일럿 첫 월요일에 그만둘 이유가 된다.
   *
   * 그래서 분모를 7일로 바꾼다. 개수는 여전히 보여주되(부풀림 방지) 판단 기준은 날짜다.
   */
  const publishedDays = new Set(
    published.map((p) => kstMidnight(Date.parse((p.published_at ?? p.created_at) as string))),
  );
  const daysCovered = publishedDays.size;
  const weekDays = Math.min(7, Math.floor((kstMidnight(nowMs) - start) / DAY) + 1);
  const missedDays = Math.max(0, weekDays - daysCovered);
  // 오늘 이미 올렸는가 — "오늘 하나"를 안내할지 결정한다
  const publishedToday = publishedDays.has(kstMidnight(nowMs));

  // "새 리뷰"는 **손님이 이번 주에 남긴** 리뷰다. 우리가 언제 긁어왔는지가 아니다.
  // crawled_at을 앞에 두면 첫 크롤에서 과거 리뷰가 전부 '이번 주'로 잡힌다 —
  // 스타일링룸 실측: 실제 2건인데 12건으로 보고되고 있었다(최대 43일 전 글까지).
  // 그 숫자가 월요일 다이제스트로 사장님 카톡에 그대로 간다.
  // posted_at은 운영 21건 전부 채워져 있고 이상값 0이라 이쪽을 우선한다(없을 때만 crawled_at).
  const weekReviews = reviews.filter((r) => inWindow(r.posted_at ?? r.crawled_at));
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
  } else if (daysCovered >= weekDays && weekDays > 0) {
    headline = `이번 주 ${weekDays}일 내내 올리셨어요. 완벽한 한 주예요.`;
  } else if (daysCovered > 0) {
    headline = `이번 주 ${weekDays}일 중 ${daysCovered}일 올리셨어요.`;
  } else if (weekPosts.length > 0) {
    headline = `이번 주는 아직 올리신 날이 없어요. 글은 매일 준비돼 있으니 하나만 올려보세요.`;
  } else {
    headline = `이번 주 리뷰 ${weekReviews.length}건이 새로 들어왔어요.`;
  }

  // ── 숫자 ──
  // 분모는 '준비된 개수'가 아니라 '날'이다 — 하루 하나가 우리가 약속한 기준선.
  const stats: ReportStat[] = [
    { label: '올린 날', value: `${daysCovered}/${weekDays}`, sub: missedDays === 0 ? '매일 하셨어요' : `${missedDays}일 쉬어감` },
    { label: '올린 글', value: `${published.length}` },
    { label: '준비된 글', value: `${weekPosts.length}`, sub: '채널별로 매일 아침' },
  ];
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
  if (daysCovered >= weekDays && weekDays >= 3) wins.push(`하루도 빠짐없이 올리셨어요. 이 습관이 가장 크게 쌓입니다.`);
  else if (daysCovered >= 3) wins.push(`${daysCovered}일 올리셨어요. 이 속도면 노출이 쌓입니다.`);
  else if (daysCovered > 0) wins.push(`${daysCovered}일 올리셨어요. 주 3일을 넘기면 검색 노출이 확실히 달라집니다.`);
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
  // 남은 초안 개수를 할 일로 세지 않는다 — 채널 수만큼 매일 남는 게 정상이고,
  // 우리가 "하나만 하면 된다"고 해놓고 나머지를 빚으로 돌려주면 앞뒤가 안 맞는다.
  // 오늘 아직 안 올렸을 때만, 개수 없이 하나를 권한다.
  if (!publishedToday && waiting.length > 0) {
    todos.push({ text: '오늘 글이 준비돼 있어요 — 하나만 올리면 돼요', href: '/dashboard' });
  }

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
