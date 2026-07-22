import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { ReviewList, type ReviewRow } from '@/components/review-list';

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
    .select('id, name, naver_place_url')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) redirect('/onboarding');

  const { data: rows } = await supabase
    .from('reviews')
    .select('id, author_display, content, sentiment, sentiment_score, reply_draft, reply_sent_at, posted_at')
    .eq('store_id', store.id)
    .order('posted_at', { ascending: false })
    .limit(100);

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

  const total = reviews.length;
  const pos = reviews.filter((r) => r.sentiment === 'positive').length;
  const neu = reviews.filter((r) => r.sentiment === 'neutral').length;
  const neg = reviews.filter((r) => r.sentiment === 'negative').length;
  const pending = reviews.filter((r) => !r.replySentAt && r.replyDraft).length;
  const negOpen = reviews.filter((r) => r.sentiment === 'negative' && !r.replySentAt).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const placeId = placeIdFromUrl(store.naver_place_url);

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
          네이버 플레이스 리뷰를 매일 자동 수집하고 감정을 분석해요. 부정 리뷰는 즉시 알려드립니다.
        </p>

        {/* 플레이스 미연결 안내 — 연결 안 하면 리뷰가 영영 안 들어오니 정직하게 */}
        {!placeId && (
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
          <ReviewList reviews={reviews} placeId={placeId} />
        </section>
      </main>
    </div>
  );
}
