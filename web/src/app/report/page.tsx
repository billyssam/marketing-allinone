import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { buildWeeklyReport, type ReportPost, type ReportReview } from '@shared/weekly-report';
import { CopyReportButton } from '@/components/copy-report-button';

export const metadata = { title: '주간 리포트' };

/**
 * 주간 리포트 — 대시보드가 "오늘 할 일"이라면 여기는 "이번 주 이렇게 됐어요".
 *
 * 자동화의 가치는 누적으로 느껴지는데, 매일 조금씩 되는 일은 체감이 안 된다.
 * 파일럿 사장님이 "이거 계속 쓸까"를 판단하는 근거가 이 화면이라
 * 숫자만 늘어놓지 않고 문장으로 되돌려주고, 놓친 것은 바로 누를 수 있게 연결한다.
 */
export default async function ReportPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;
  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">사장님 계정으로 로그인하면 주간 리포트가 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase.from('stores').select('id, name, brand_tone').eq('owner_id', user.id).maybeSingle();
  if (!store) redirect('/onboarding');

  // 플레이스에 표시된 리뷰 총량 기록 — "리뷰 늘었나?"에 답할 수 있는 유일한 실측 지표.
  // (우리가 크롤하는 건 최신 20건 표본이라 그걸로 추이를 내면 거짓말이 된다)
  const reviewHistory =
    ((store.brand_tone as { place_facts?: { reviewHistory?: { at: string; count: number }[] } } | null)
      ?.place_facts?.reviewHistory) ?? [];

  // 집계 범위는 최근 14일까지만 읽는다(주간 계산엔 7일이면 되지만,
  // "안 올린 글"은 누적이라 조금 더 넓게 본 뒤 순수 함수가 판단한다).
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const [postsRes, reviewsRes] = await Promise.all([
    supabase
      .from('posts')
      .select('created_at, published_at, status, channel')
      .eq('store_id', store.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    // 리뷰는 기간으로 자르지 않는다. "답글 안 단 리뷰"는 누적 기준이라
    // 21일로 자르면 오래된 미답변이 통째로 안 보인다(실측: 쿵더쿵 9건이 전부 사라짐).
    // 이번 주 집계는 순수 함수가 crawled_at으로 다시 걸러낸다.
    supabase
      .from('reviews')
      .select('crawled_at, posted_at, sentiment, reply_sent_at')
      .eq('store_id', store.id)
      .order('crawled_at', { ascending: false })
      .limit(500),
  ]);

  const report = buildWeeklyReport(
    store.name,
    (postsRes.data ?? []) as ReportPost[],
    (reviewsRes.data ?? []) as ReportReview[],
    Date.now(),
    { reviewHistory },
  );

  return (
    <div className="min-h-screen">
      <AppHeader storeName={store.name} current="/report" width="4xl" />

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
        <div className="eyebrow">주간 리포트</div>
        <h1 className="h2 mt-2">{report.periodLabel}</h1>

        {/* 한 줄 요약 — 이 화면에서 제일 먼저 읽혀야 하는 문장 */}
        <p className="mt-5 text-[19px] leading-relaxed tracking-tight text-[var(--color-fg)] sm:text-[21px]">
          {report.headline}
        </p>

        {/* 숫자 */}
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-hair)] sm:grid-cols-4">
          {report.stats.map((s) => (
            <div key={s.label} className="min-w-0 bg-[var(--color-panel)] px-4 py-5">
              <div className="eyebrow">{s.label}</div>
              <div className="mono mt-2 text-[26px] leading-none tabular-nums">{s.value}</div>
              {s.sub && <div className="mt-2 text-[12px] leading-snug text-[var(--color-fg-3)]">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* 다음 행동 — 놓친 것이 있으면 숫자보다 위에 오는 게 맞지만,
            먼저 성과를 보고 나서 행동으로 이어지는 흐름이 더 읽힌다 */}
        {report.todos.length > 0 && (
          <section className="mt-8">
            <h2 className="eyebrow">다음에 하실 것</h2>
            <ul className="mt-3 space-y-2">
              {report.todos.map((t) => (
                <li key={t.text}>
                  <Link
                    href={t.href}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 transition hover:border-[var(--color-hair-strong)]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-[14px]">
                      {t.urgent && (
                        <span className="shrink-0 rounded-md bg-[var(--color-bad)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-bad)]">
                          급함
                        </span>
                      )}
                      <span className="truncate">{t.text}</span>
                    </span>
                    <span className="shrink-0 text-[13px] text-[var(--color-fg-3)]">보기 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 잘된 것 */}
        {report.wins.length > 0 && (
          <section className="mt-8">
            <h2 className="eyebrow">이번 주 잘된 것</h2>
            <ul className="mt-3 space-y-2.5">
              {report.wins.map((w) => (
                <li key={w} className="flex gap-3 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-good)]" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-[var(--color-hair)] pt-6">
          <CopyReportButton text={report.plainText} />
          <Link href="/dashboard" className="text-[13px] text-[var(--color-fg-3)] underline underline-offset-2 hover:text-[var(--color-fg-2)]">
            오늘 할 일 보기
          </Link>
        </div>

        {/* fg-4는 12px 본문에서 대비 미달(axe serious) — /posts 칩과 같은 유형 */}
        <p className="mt-6 text-[12px] leading-relaxed text-[var(--color-fg-3)]">
          최근 7일(오늘 포함) 기준입니다. 도달·조회 수는 채널을 연동해야 집계할 수 있어
          여기에 넣지 않았습니다.
        </p>
      </main>
    </div>
  );
}
