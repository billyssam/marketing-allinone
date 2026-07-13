import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { signOut } from '@/app/auth/actions';
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
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold">로그인</Link>
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
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const placeId = placeIdFromUrl(store.naver_place_url);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
            <span className="text-[15px] font-semibold">{store.name}</span>
          </div>
          <nav className="flex items-center gap-4 text-[13px] text-[var(--color-fg-2)] sm:gap-5">
            <Link href="/dashboard" className="hover:text-[var(--color-fg)]">대시보드</Link>
            <Link href="/reviews" className="text-[var(--color-fg)]">리뷰</Link>
            <Link href="/regulars" className="hover:text-[var(--color-fg)]">단골</Link>
            <Link href="/channels" className="hover:text-[var(--color-fg)]">채널</Link>
            <form action={signOut}><button type="submit" className="hover:text-[var(--color-fg)]">로그아웃</button></form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6">
        <div className="eyebrow">리뷰 모니터링</div>
        <h1 className="h1 mt-2">고객 리뷰 · 답글 관리</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">
          네이버 플레이스 리뷰를 매일 자동 수집하고 감정을 분석해요. 부정 리뷰는 즉시 알려드립니다.
        </p>

        {/* 감정 분포 요약 */}
        {total > 0 && (
          <div className="panel mt-6 rounded-[var(--radius-lg)] p-4">
            <div className="mb-2 flex items-center justify-between text-[12.5px]">
              <span className="font-semibold">감정 분포</span>
              <span className="mono text-[var(--color-fg-3)]">총 {total}건</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
              <div style={{ width: `${pct(pos)}%`, background: 'var(--color-good)' }} />
              <div style={{ width: `${pct(neu)}%`, background: 'var(--color-fg-4)' }} />
              <div style={{ width: `${pct(neg)}%`, background: 'var(--color-bad)' }} />
            </div>
            <div className="mt-2.5 flex gap-4 text-[11.5px]">
              <span className="text-[var(--color-good)]">긍정 {pos} · {pct(pos)}%</span>
              <span className="text-[var(--color-fg-3)]">중립 {neu} · {pct(neu)}%</span>
              <span className="text-[var(--color-bad)]">부정 {neg} · {pct(neg)}%</span>
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
