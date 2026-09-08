import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { ReviewList, type ReviewRow } from '@/components/review-list';
import { resolveBusinessType, hasPlacePage } from '@shared/business/taxonomy';

export const metadata = { title: '리뷰 관리' };

/** review-crawler(playwright 의존)를 web에 들이지 않으려 인라인 */
function placeIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/place\/(\d+)/);
  return m ? m[1] : null;
}

export default async function ReviewsPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">사장님 계정으로 로그인하면 리뷰 관리 화면이 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, naver_place_url, industry_id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) redirect('/onboarding');

  const LIST_LIMIT = 100;
  // 목록은 최근 100건만(렌더 비용), 요약 수치는 **전체 기준**으로 따로 집계한다.
  // 안 그러면 대시보드("500건 기준")와 이 화면("100건")이 다른 숫자를 말해 신뢰가 깨진다(실측 발견).
  const [rowsRes, totalRes, posRes, neuRes, negRes, pendingRes, negOpenRes, recentDoneRes] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, author_display, content, sentiment, sentiment_score, reply_draft, reply_sent_at, posted_at')
      .eq('store_id', store.id)
      /**
       * ⚠️ **자르기가 정렬보다 먼저 일어난다.** 화면(`review-list`)은 "부정 → 답글대기 → 최신"으로
       * 다시 정렬하지만, 그건 **여기서 잘라 보낸 100건 안에서만** 도는 정렬이다.
       * 미답이 100건을 넘으면 오래된 부정 미답이 아예 안 실려 오고,
       * "부정 리뷰가 맨 위로 올라와 놓치지 않아요"라는 약속이 조용히 깨진다.
       * (2026-09-08 가짜 리뷰 120건 주입으로 실측 — 가장 오래된 미답이 목록에서 사라졌다)
       *
       * 그래서 **서버 정렬을 화면 정렬과 같은 우선순위로** 맞춘다:
       *   ① 미답 먼저(reply_sent_at nulls first)
       *   ② 그 안에서 부정 먼저 — `sentiment` 오름차순이 곧 negative < neutral < positive 다.
       *      (알파벳 순서에 기대는 트릭이라 값을 바꾸면 조용히 깨진다 → 아래 테스트가 지킨다)
       *   ③ 같은 조건이면 최신 먼저
       */
      .order('reply_sent_at', { ascending: true, nullsFirst: true })
      .order('sentiment', { ascending: true })
      .order('posted_at', { ascending: false })
      .limit(LIST_LIMIT),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'positive'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'neutral'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'negative'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).not('reply_draft', 'is', null).is('reply_sent_at', null),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'negative').is('reply_sent_at', null),
    /**
     * **방금 완료 체크한 리뷰**는 따로 가져온다.
     *
     * 왜: 완료를 누르면 그 리뷰는 정렬상 맨 뒤로 가고, 미답이 100건을 넘는 매장에서는
     * **목록 밖으로 밀려 화면에서 사라진다.** 카드에 '완료 취소' 버튼이 분명히 있는데도
     * 손이 닿지 않아 **잘못 누르면 되돌릴 수 없다**(2026-09-08 가짜 120건 주입으로 실측).
     * 최근 24시간 안에 완료한 것만 되살린다 — 오래된 완료분까지 끌어오면 목록이 다시 무거워진다.
     */
    supabase
      .from('reviews')
      .select('id, author_display, content, sentiment, sentiment_score, reply_draft, reply_sent_at, posted_at')
      .eq('store_id', store.id)
      .gte('reply_sent_at', new Date(Date.now() - 86_400_000).toISOString())
      .order('reply_sent_at', { ascending: false })
      .limit(20),
  ]);

  // 목록 + 방금 완료분을 합친다(중복 제거 — 100건 안에 이미 있으면 그대로 둔다)
  const seen = new Set((rowsRes.data ?? []).map((r) => r.id as string));
  const rows = [...(rowsRes.data ?? []), ...(recentDoneRes.data ?? []).filter((r) => !seen.has(r.id as string))];

  const reviews: ReviewRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    author: (r.author_display ?? null) as string | null,
    content: r.content as string,
    sentiment: (r.sentiment ?? null) as ReviewRow['sentiment'],
    score: (r.sentiment_score ?? null) as number | null,
    replyDraft: (r.reply_draft ?? null) as string | null,
    postedAt: (r.posted_at ?? null) as string | null,
    replySentAt: (r.reply_sent_at ?? null) as string | null,
  }));

  // 요약은 전체 집계(count 쿼리) — 목록 100건 표본이 아니라 매장의 진짜 수치
  const total = totalRes.count ?? 0;
  const pos = posRes.count ?? 0;
  const neu = neuRes.count ?? 0;
  const neg = negRes.count ?? 0;
  const pending = pendingRes.count ?? 0;
  const negOpen = negOpenRes.count ?? 0;
  const hiddenCount = Math.max(0, total - reviews.length);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const placeId = placeIdFromUrl(store.naver_place_url);
  // 이 업종이 네이버 플레이스를 가질 수 있는가 — 온라인 셀러·프리랜서·과외는 못 가진다
  const canHavePlace = hasPlacePage(resolveBusinessType(store.industry_id as string));

  const sentiments = [
    { key: 'pos', label: '긍정', n: pos, color: 'var(--color-good)' },
    { key: 'neu', label: '중립', n: neu, color: 'var(--color-fg-4)' },
    { key: 'neg', label: '부정', n: neg, color: 'var(--color-bad)' },
  ];
  const kpis = [
    { label: '수집 리뷰', value: String(total), unit: '건' },
    { label: '긍정률', value: total ? String(pct(pos)) : '—', unit: total ? '%' : '', accent: total && pct(pos) >= 80 ? 'var(--color-good)' : undefined },
    { label: '답글 대기', value: String(pending), unit: '건', accent: pending > 0 ? 'var(--color-amber)' : undefined },
    { label: '부정 미답', value: String(negOpen), unit: '건', accent: negOpen > 0 ? 'var(--color-bad)' : undefined },
  ];

  return (
    <div className="min-h-screen">
      <AppHeader storeName={store.name as string} current="/reviews" />

      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6">
        <div className="eyebrow">리뷰 모니터링</div>
        <h1 className="h1 mt-2">고객 리뷰 · 답글 관리</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">
          {canHavePlace
            ? '네이버 플레이스 리뷰를 매일 자동 수집하고 감정을 분석해요. 부정 리뷰가 맨 위로 올라와 놓치지 않아요.'
            : '온라인 판매는 네이버 플레이스 리뷰가 없어요. 스마트스토어·쿠팡 리뷰 수집은 아직 준비 중입니다.'}
        </p>

        {/* 플레이스를 못 가지는 업종에 "연결하세요"는 **영영 못 지킬 안내**다.
            온라인 셀러·프리랜서·과외가 여기 해당한다(2026-09-03 실사용자 화면에서 실측).
            못 하는 건 못 한다고 적고, 대신 지금 할 수 있는 곳으로 보낸다. */}
        {!canHavePlace && (
          <Link href="/dashboard" className="mt-6 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 transition hover:border-[var(--color-hair-strong)]">
            <span className="flex items-center gap-2.5 text-[13px] text-[var(--color-fg-2)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-fg-4)]" />
              <span>준비되면 알려드릴게요. 그동안은 <b className="text-[var(--color-fg)]">매일 준비되는 글</b>에 집중하시면 돼요.</span>
            </span>
            <span className="shrink-0 text-[12px] font-medium text-[var(--color-amber)]">대시보드 →</span>
          </Link>
        )}

        {/* 플레이스 미연결 안내 — 연결 안 하면 리뷰가 영영 안 들어오니 정직하게 */}
        {canHavePlace && !placeId && (
          <Link href="/settings" className="mt-6 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 transition hover:border-[var(--color-hair-strong)]">
            <span className="flex items-center gap-2.5 text-[13px] text-[var(--color-fg-2)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-amber)]" />
              <span>네이버 플레이스 주소를 연결하면 리뷰가 매일 자동으로 수집돼요.</span>
            </span>
            <span className="shrink-0 text-[12px] font-medium text-[var(--color-amber)]">연결하기 →</span>
          </Link>
        )}

        {/* 요약 — KPI + 감정 분포(diverging, 세그먼트 2px 갭, 스와치 범례) */}
        {total > 0 && (
          <div className="panel mt-6 rounded-[var(--radius-lg)] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="min-w-0">
                  <div className="eyebrow">{k.label}</div>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: k.accent ?? 'var(--color-fg)' }}>{k.value}</span>
                    {k.unit && <span className="text-[12px] text-[var(--color-fg-3)]">{k.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-[var(--color-hair)] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow">감정 분포</span>
                <span className="mono text-[10px] text-[var(--color-fg-3)]">총 {total.toLocaleString()}건</span>
              </div>
              <div className="flex h-2.5 gap-0.5">
                {sentiments.map((s) =>
                  s.n > 0 ? (
                    <div key={s.key} className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${pct(s.n)}%`, background: s.color }} title={`${s.label} ${s.n}건 · ${pct(s.n)}%`} />
                  ) : null,
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--color-fg-2)]">
                {sentiments.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[3px]" style={{ background: s.color }} />
                    {s.label} <span className="tabular-nums text-[var(--color-fg-3)]">{s.n} · {pct(s.n)}%</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <section className="mt-6">
          {/* 잘림 안내는 리스트 안에서 한다 — 어떤 탭을 보고 있는지는 리스트만 안다.
              페이지에서 한 번 더 알리면 같은 화면에 비슷한 문장이 두 개가 된다. */}
          <ReviewList reviews={reviews} placeId={placeId} totals={{ all: total, pending, negative: neg }} />
        </section>
      </main>
    </div>
  );
}
