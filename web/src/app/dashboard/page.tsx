import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { DashboardPerformance, type PerfData } from '@/components/dashboard-performance';
import { signOut } from '@/app/auth/actions';
import { CHANNELS, AUTOMATION_LABEL, type ChannelId } from '@shared/channels/registry';
import { GenerateButton } from '@/components/generate-button';
import { DashboardBriefing, type BriefingItem } from '@/components/dashboard-briefing';
import { POST_CHANNEL_LABEL, POST_CHANNEL_COLOR, POST_STATUS_LABEL, type PostChannel, type PostStatus } from '@/lib/posts';
import { isReactivationTarget, daysSince } from '@shared/content-engine/reactivation';

export const metadata = { title: '대시보드' };

const CONN_STATUS: Record<string, { label: string; color: string }> = {
  connected: { label: '연결됨', color: 'var(--color-good)' },
  pending: { label: '연결 대기', color: 'var(--color-fg-3)' },
  error: { label: '오류', color: 'var(--color-bad)' },
};

export default async function DashboardPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  // 데모 모드: Supabase 미설정 or 미로그인 → 로그인 안내
  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">Supabase 연결 후 사장님 계정으로 로그인하면 실데이터 대시보드가 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store, error: storeErr } = await supabase.from('stores').select('*').eq('owner_id', user.id).maybeSingle();
  // 조회 에러(일시적 장애 등)를 "매장 없음"으로 오인해 온보딩으로 튕기지 않도록 구분
  if (storeErr) throw new Error(`매장 정보를 불러오지 못했어요: ${storeErr.message}`);
  if (!store) redirect('/onboarding');

  // 매장 하위 데이터는 서로 독립 → 병렬 조회(순차 → 1왕복)
  const [connsRes, recentPostsRes, todoPostsRes, pendingReviewsRes, allReviewsRes, postsCountRes, regularsRes] = await Promise.all([
    supabase.from('channel_connections').select('channel_id, status').eq('store_id', store.id),
    supabase.from('posts').select('id, channel, title, status, created_at').eq('store_id', store.id).order('created_at', { ascending: false }).limit(8),
    // 오늘의 브리핑 = 발행 대기 초안(draft·ready)
    supabase.from('posts').select('id, channel, title, status').eq('store_id', store.id).in('status', ['draft', 'ready']).order('created_at', { ascending: false }).limit(6),
    // + 답글 대기 리뷰
    supabase.from('reviews').select('id, source, rating, content').eq('store_id', store.id).not('reply_draft', 'is', null).is('reply_sent_at', null).order('posted_at', { ascending: false }).limit(3),
    // 성과: 리뷰 감정 집계 (실데이터)
    supabase.from('reviews').select('sentiment, reply_draft, reply_sent_at').eq('store_id', store.id).limit(1000),
    // 성과: 초안 총계
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    // 재방문: 단골 방문일
    supabase.from('regulars').select('last_visit_at').eq('store_id', store.id).limit(1000),
  ]);

  const conns = (connsRes.data ?? []) as { channel_id: string; status: string | null }[];
  const connected = conns.map((c) => c.channel_id as ChannelId);
  const connStatus = new Map(conns.map((c) => [c.channel_id, c.status ?? 'pending']));
  const drafts = recentPostsRes.data ?? [];
  const draftsLoadFailed = Boolean(recentPostsRes.error); // 에러를 "초안 없음"으로 오인하지 않도록 구분
  const todoPosts = todoPostsRes.data;
  const pendingReviews = pendingReviewsRes.data;

  // 성과 실데이터 (없는 지표는 컴포넌트에서 "집계 예정"으로 정직 표시)
  const allReviews = allReviewsRes.data ?? [];
  const perfData: PerfData = {
    totalReviews: allReviews.length,
    positive: allReviews.filter((r) => r.sentiment === 'positive').length,
    neutral: allReviews.filter((r) => r.sentiment === 'neutral').length,
    negative: allReviews.filter((r) => r.sentiment === 'negative').length,
    pendingReplies: allReviews.filter((r) => r.reply_draft && !r.reply_sent_at).length,
    totalPosts: postsCountRes.count ?? 0,
  };

  // 재방문 유도 대상(끊긴 단골) 수
  const nowMs = Date.now();
  const reactivationTargets = (regularsRes.data ?? []).filter((r) =>
    isReactivationTarget(daysSince(r.last_visit_at as string | null, nowMs)),
  ).length;

  const briefingItems: BriefingItem[] = [
    ...(todoPosts ?? []).map((p) => ({
      key: `post-${p.id}`,
      kind: 'post' as const,
      channelLabel: POST_CHANNEL_LABEL[p.channel as PostChannel] ?? p.channel,
      color: POST_CHANNEL_COLOR[p.channel as PostChannel] ?? 'var(--color-amber)',
      title: p.title || '(제목 없음)',
      status: p.status === 'ready' ? '발행 준비됨' : '초안 준비됨',
      actionLabel: '붙여넣기 →',
      href: `/prepare?post=${p.id}`,
    })),
    ...(pendingReviews ?? []).map((r) => ({
      key: `review-${r.id}`,
      kind: 'review' as const,
      channelLabel: '리뷰',
      color: 'var(--color-review)',
      title: `${r.rating ? '★'.repeat(r.rating) : ''} ${r.content}`.trim(),
      status: '답글 대기',
      actionLabel: '답글 확인 →',
      href: '/reviews',
    })),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
            <span className="text-[15px] font-semibold">{store.name}</span>
          </div>
          <nav className="flex items-center gap-4 text-[13px] text-[var(--color-fg-2)] sm:gap-5">
            <Link href="/dashboard" className="text-[var(--color-fg)]">대시보드</Link>
            <Link href="/reviews" className="hover:text-[var(--color-fg)]">리뷰</Link>
            <Link href="/regulars" className="hover:text-[var(--color-fg)]">단골</Link>
            <Link href="/channels" className="hover:text-[var(--color-fg)]">채널</Link>
            <form action={signOut}><button type="submit" className="hover:text-[var(--color-fg)]">로그아웃</button></form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">오늘의 브리핑</div>
            <h1 className="h1 mt-2">{store.name} 사장님, 좋은 아침이에요.</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/channels" className="rounded-full border border-[var(--color-hair-strong)] px-4 py-2 text-[13px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]">
              + 채널 추가
            </Link>
            <GenerateButton />
          </div>
        </div>

        {/* 오늘의 브리핑 (실데이터: 발행 대기 초안 + 답글 대기 리뷰) */}
        <section className="mt-6">
          <DashboardBriefing items={briefingItems} />
        </section>

        {/* 재방문 유도 넛지 (끊긴 단골 있을 때) */}
        {reactivationTargets > 0 && (
          <Link href="/regulars" className="mt-3 flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 transition hover:border-[var(--color-hair-strong)]">
            <span className="flex items-center gap-2.5 text-[13px] text-[var(--color-fg-2)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-amber)]" />
              <span><b className="text-[var(--color-fg)]">{reactivationTargets}명</b>의 끊긴 단골에게 재방문 메시지가 준비됐어요</span>
            </span>
            <span className="shrink-0 text-[12px] font-medium text-[var(--color-amber)]">단골 관리 →</span>
          </Link>
        )}

        {/* 연결된 채널 상태 */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">연결된 채널 <span className="mono text-[var(--color-fg-3)]">{connected.length}</span></div>
          {connected.length === 0 ? (
            <div className="panel rounded-[var(--radius-lg)] p-8 text-center">
              <p className="text-[14px] text-[var(--color-fg-2)]">아직 연결된 채널이 없어요.</p>
              <Link href="/channels" className="btn-primary mt-4 inline-block rounded-full px-5 py-2.5 text-[13px] font-semibold">채널 연결하러 가기</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {connected.map((id) => {
                const ch = CHANNELS.find((c) => c.id === id);
                if (!ch) return null;
                const au = AUTOMATION_LABEL[ch.automation];
                const st = CONN_STATUS[connStatus.get(id) ?? 'pending'] ?? CONN_STATUS.pending;
                return (
                  <div key={id} className="panel rounded-[var(--radius)] p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ch.color }} />
                      <span className="text-[13.5px] font-medium">{ch.name}</span>
                    </div>
                    <div className="mono mt-2 flex items-center gap-1.5 text-[10px]">
                      <span style={{ color: au.color }}>{au.label}</span>
                      <span className="text-[var(--color-fg-4)]">·</span>
                      <span style={{ color: st.color }}>{st.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 최근 초안 (posts 영속화 결과) */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            최근 초안 <span className="mono text-[var(--color-fg-3)]">{drafts.length}</span>
          </div>
          {drafts.length === 0 ? (
            <div className="panel rounded-[var(--radius-lg)] p-8 text-center">
              {draftsLoadFailed ? (
                <p className="text-[14px] text-[var(--color-fg-2)]">초안을 불러오지 못했어요. 잠시 후 새로고침 해주세요.</p>
              ) : (
                <p className="text-[14px] text-[var(--color-fg-2)]">아직 생성한 글이 없어요. 위 <b>‘오늘 글 생성’</b>을 눌러보세요.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {drafts.map((p) => (
                <Link
                  key={p.id}
                  href={`/prepare?post=${p.id}`}
                  className="panel group rounded-[var(--radius)] p-4 transition hover:border-[var(--color-hair-strong)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono text-[10px] text-[var(--color-fg-3)]">{POST_CHANNEL_LABEL[p.channel as PostChannel] ?? p.channel}</span>
                    <span className="mono rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-3)]">{POST_STATUS_LABEL[p.status as PostStatus] ?? p.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13.5px] font-medium group-hover:text-[var(--color-fg)]">{p.title || '(제목 없음)'}</p>
                  <p className="mt-2 text-[11px] text-[var(--color-fg-3)]">붙여넣기 도우미 열기 →</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 성과 (실데이터: 리뷰 감정·초안. 도달·조회는 채널 연동 후) */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            성과 <span className="mono rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-3)]">실시간</span>
          </div>
          <DashboardPerformance data={perfData} />
        </section>
      </main>
    </div>
  );
}
