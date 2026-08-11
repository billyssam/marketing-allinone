import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { DashboardPerformance, type PerfData } from '@/components/dashboard-performance';
import { AppHeader } from '@/components/app-header';
import { CHANNELS, AUTOMATION_LABEL, channelIdOfPost, type ChannelId } from '@shared/channels/registry';
import { pickDailyFocus } from '@shared/content-engine/daily-focus';
import { DailyFocusCard } from '@/components/daily-focus-card';
import { InstallPrompt } from '@/components/install-prompt';
import { GenerateButton } from '@/components/generate-button';
import { DashboardBriefing, type BriefingItem } from '@/components/dashboard-briefing';
import { FirstDraftPending } from '@/components/first-draft-pending';
import { POST_CHANNEL_LABEL, POST_CHANNEL_COLOR, POST_STATUS_LABEL, postDisplayTitle, type PostChannel, type PostStatus } from '@/lib/posts';
import { isReactivationTarget, daysSince } from '@shared/content-engine/reactivation';
import { buildWeekly, buildFeed } from '@/lib/activity';
import { DashboardStats, type StatStripData } from '@/components/dashboard-stats';
import { resolveBusinessType, marketingFocusFor } from '@shared/business/taxonomy';
import { resolveOfferings, offeringNoun } from '@shared/content-engine/offerings';
import { placeFromBrandTone } from '@shared/content-engine/place-facts';
import { anglesForOffering, weekPlan } from '@shared/content-engine/angles';
import { WeekPlan } from '@/components/week-plan';

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
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">로그인</Link>
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
  const [connsRes, recentPostsRes, todoPostsRes, pendingReviewsRes, urgentNegRes, reviewTotalRes, reviewPosRes, reviewNeuRes, reviewNegRes, reviewPendingRes, postsCountRes, regularsRes, feedPostsRes, feedReviewsRes] = await Promise.all([
    supabase.from('channel_connections').select('channel_id, status').eq('store_id', store.id),
    supabase.from('posts').select('id, channel, title, body_plain, status, created_at').eq('store_id', store.id).order('created_at', { ascending: false }).limit(8),
    // 오늘의 브리핑 = 발행 대기 초안(draft·ready) 중 최근 2일 것만.
    // 지난 글은 지우지 않고 아래 '최근 초안'에 남김 — 브리핑은 오늘 할 일이어야 함(무덤 방지)
    // limit 6이었는데 8채널을 연결하면 2건이 잘려 만든 글이 대시보드에서 아예 안 보였다.
    // 지금은 우선순위 카드가 1~2개만 세우고 나머지는 접으므로 넉넉히 가져와도 부담이 없다.
    supabase.from('posts').select('id, channel, title, body_plain, status').eq('store_id', store.id).in('status', ['draft', 'ready']).gte('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(12),
    // + 답글 대기 리뷰
    supabase.from('reviews').select('id, source, rating, content').eq('store_id', store.id).not('reply_draft', 'is', null).is('reply_sent_at', null).order('posted_at', { ascending: false }).limit(3),
    // 답글 안 단 **부정** 리뷰 — 글보다 급하다. 위 목록은 limit 3이라 부정이 밀려 안 보일 수 있어 따로 본다.
    supabase.from('reviews').select('id, content', { count: 'exact' }).eq('store_id', store.id).eq('sentiment', 'negative').is('reply_sent_at', null).order('posted_at', { ascending: false }).limit(1),
    // 성과: 리뷰 감정 집계 — count 쿼리(전체 기준). 행을 가져와 세면 limit 넘는 순간 숫자가 틀어지고
    // /reviews 화면과 다른 값을 말하게 된다(실측 발견: 대시보드 500 vs 리뷰화면 100).
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'positive'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'neutral'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'negative'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', store.id).not('reply_draft', 'is', null).is('reply_sent_at', null),
    // 성과: 초안 총계
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    // 재방문: 단골 방문일
    supabase.from('regulars').select('last_visit_at').eq('store_id', store.id).limit(1000),
    // 활동피드·주간차트: 최근 14일 posts + 리뷰 이벤트
    supabase.from('posts').select('created_at, published_at, channel, title, metadata').eq('store_id', store.id).gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(100),
    supabase.from('reviews').select('crawled_at, reply_sent_at, sentiment').eq('store_id', store.id).order('crawled_at', { ascending: false }).limit(60),
  ]);

  const conns = (connsRes.data ?? []) as { channel_id: string; status: string | null }[];
  const connected = conns.map((c) => c.channel_id as ChannelId);
  const connStatus = new Map(conns.map((c) => [c.channel_id, c.status ?? 'pending']));
  const drafts = recentPostsRes.data ?? [];
  const draftsLoadFailed = Boolean(recentPostsRes.error); // 에러를 "초안 없음"으로 오인하지 않도록 구분
  const todoPosts = todoPostsRes.data;
  const pendingReviews = pendingReviewsRes.data;

  // 성과 실데이터 — 전체 count 기준(리뷰가 아무리 쌓여도 /reviews 화면과 같은 숫자)
  const totalReviews = reviewTotalRes.count ?? 0;
  const positive = reviewPosRes.count ?? 0;
  const perfData: PerfData = {
    totalReviews,
    positive,
    neutral: reviewNeuRes.count ?? 0,
    negative: reviewNegRes.count ?? 0,
    pendingReplies: reviewPendingRes.count ?? 0,
    totalPosts: postsCountRes.count ?? 0,
  };

  // 주간 생성 차트 + 활동 피드 (실데이터)
  const feedPosts = feedPostsRes.data ?? [];
  const weekly = buildWeekly(feedPosts.map((p) => p.created_at as string), Date.now());
  const feed = buildFeed(feedPosts, feedReviewsRes.data ?? [], Date.now());
  const weekPosts = weekly.reduce((s, w) => s + w.count, 0);

  // 업종 적응: 사업 유형 + 판매 항목(offerings) → 히어로 KPI·헤더 프레이밍
  const business = resolveBusinessType(store.industry_id);
  const offerings = resolveOfferings(store.brand_tone, placeFromBrandTone(store.brand_tone));
  // 이번 주 콘텐츠 계획(각도 로테이션이 결정적 → 미리보기)
  const plan = weekPlan(business.offering, store.id, offerings.map((o) => o.name), Date.now(), 5);

  // 온보딩 직후(5분 내) + 초안 0 → 웰컴 드래프트 생성 대기 표시
  const justOnboarded =
    !!store.onboarded_at && Date.now() - Date.parse(store.onboarded_at) < 5 * 60_000;

  // 재방문 유도 대상(끊긴 단골) 수
  const nowMs = Date.now();
  const reactivationTargets = (regularsRes.data ?? []).filter((r) =>
    isReactivationTarget(daysSince(r.last_visit_at as string | null, nowMs)),
  ).length;

  // 오늘의 우선순위 — 채널을 여러 개 연결하면 붙여넣기가 8건까지 뜬다.
  // 전부 평평하게 나열하면 아무것도 안 하게 되므로 하나를 골라 이유와 함께 앞에 세운다.
  const publishedHistory = await supabase
    .from('posts')
    .select('channel, published_at')
    .eq('store_id', store.id)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(200);
  const lastPublished = new Map<string, string>();
  for (const row of publishedHistory.data ?? []) {
    // 내림차순이라 처음 만난 것이 그 채널의 최신
    if (!lastPublished.has(row.channel as string)) lastPublished.set(row.channel as string, row.published_at as string);
  }
  const focus = pickDailyFocus(
    (todoPosts ?? []).flatMap((p) => {
      const cid = channelIdOfPost(p.channel as string);
      if (!cid) return [];
      return [{
        postId: p.id as string,
        channel: cid,
        title: postDisplayTitle(p),
        lastPublishedAt: lastPublished.get(p.channel as string) ?? null,
      }];
    }),
    nowMs,
  );

  const reviewItems: BriefingItem[] = (pendingReviews ?? []).map((r) => ({
    key: `review-${r.id}`,
    kind: 'review' as const,
    channelLabel: '리뷰',
    color: 'var(--color-review)',
    title: `${r.rating ? '★'.repeat(r.rating) : ''} ${r.content}`.trim(),
    status: '답글 대기',
    actionLabel: '답글 확인 →',
    href: '/reviews',
  }));

  // 총 할 일 개수(KPI용)는 글+리뷰 합계를 유지한다
  const briefingItems: BriefingItem[] = [
    ...(todoPosts ?? []).map((p) => ({
      key: `post-${p.id}`,
      kind: 'post' as const,
      channelLabel: POST_CHANNEL_LABEL[p.channel as PostChannel] ?? p.channel,
      color: POST_CHANNEL_COLOR[p.channel as PostChannel] ?? 'var(--color-amber)',
      title: postDisplayTitle(p),
      status: p.status === 'ready' ? '발행 준비됨' : '초안 준비됨',
      actionLabel: '붙여넣기 →',
      href: `/prepare?post=${p.id}`,
    })),
    ...reviewItems,
  ];

  const statData: StatStripData = {
    offeringNoun: offeringNoun(business.offering),
    offeringCount: offerings.length,
    totalPosts: perfData.totalPosts,
    weekPosts,
    totalReviews: perfData.totalReviews,
    posRate: perfData.totalReviews ? Math.round((perfData.positive / perfData.totalReviews) * 100) : 0,
    todo: briefingItems.length,
  };

  return (
    <div className="min-h-screen">
      <AppHeader storeName={store.name} current="/dashboard" />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">{business.label} · 오늘</div>
            <h1 className="h1 mt-2">{store.name} 사장님, 좋은 아침이에요.</h1>
            <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">{marketingFocusFor(business)} 마케팅을 오늘도 준비했어요.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/channels" className="rounded-full border border-[var(--color-hair-strong)] px-4 py-2 text-[13px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]">
              + 채널 추가
            </Link>
            <GenerateButton angles={anglesForOffering(business.offering)} offeringWord={offeringNoun(business.offering)} />
          </div>
        </div>

        {/* 히어로 KPI 스트립 (업종 적응) */}
        <section className="mt-6">
          <DashboardStats data={statData} />
        </section>

        {/* 오늘의 브리핑 (실데이터: 발행 대기 초안 + 답글 대기 리뷰) */}
        {/* 답글 안 단 부정 리뷰 — 오늘 글보다 급하다. 늦게 대응할수록 손해가 커지므로 맨 위. */}
        {(urgentNegRes.count ?? 0) > 0 && (
          <Link
            href="/reviews"
            className="mt-8 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-bad)]/40 bg-[var(--color-bad)]/[0.07] p-4 transition hover:border-[var(--color-bad)]/70"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-bad)]/15 text-[15px] text-[var(--color-bad)]">!</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-[var(--color-fg)]">
                답글 안 단 아쉬운 리뷰 {urgentNegRes.count}건
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-[var(--color-fg-2)]">
                {(urgentNegRes.data?.[0]?.content as string | undefined) ?? '먼저 답글부터 달아주세요'}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-medium text-[var(--color-bad)]">답글 쓰기 →</span>
          </Link>
        )}

        <section className="mt-8">
          {briefingItems.length === 0 && perfData.totalPosts === 0 && justOnboarded ? (
            <FirstDraftPending />
          ) : focus.primary ? (
            <>
              {/* 글은 우선순위 카드로 — 같은 글이 아래 브리핑에도 뜨면 중복이라 리뷰만 넘긴다 */}
              <DailyFocusCard focus={focus} />
              {reviewItems.length > 0 && (
                <div className="mt-3">
                  <DashboardBriefing items={reviewItems} />
                </div>
              )}
            </>
          ) : (
            <DashboardBriefing items={briefingItems} />
          )}
        </section>

        {/* 플레이스 연결 넛지 — 미연결이면 리뷰 수집·매장 사실 주입이 영영 시작되지 않음
            (온보딩에서 가장 흔히 건너뛰는 단계 = 콘텐츠 품질 격차의 최대 원인).
            오프라인 매장이 있는 업종에만 — 온라인 셀러 등엔 플레이스가 없을 수 있음(범용성) */}
        {!store.naver_place_url && business.saleModes.includes('offline') && (
          <Link href="/settings" className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 transition hover:border-[var(--color-hair-strong)]">
            <span className="flex items-center gap-2.5 text-[13px] text-[var(--color-fg-2)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-amber)]" />
              <span><b className="text-[var(--color-fg)]">네이버 플레이스를 연결</b>하면 리뷰가 매일 자동 수집되고, 글에 실제 {offeringNoun(business.offering)}·영업시간이 들어가요</span>
            </span>
            <span className="shrink-0 text-[12px] font-medium text-[var(--color-amber)]">매장 설정 →</span>
          </Link>
        )}

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
          <div className="mb-3 flex items-center gap-2 text-[13px] font-medium">연결된 채널 <span className="mono text-[var(--color-fg-3)]">{connected.length}</span></div>
          {connected.length === 0 ? (
            <div className="panel rounded-[var(--radius-lg)] p-8 text-center">
              <p className="text-[14px] text-[var(--color-fg-2)]">아직 연결된 채널이 없어요.</p>
              <Link href="/channels" className="btn-primary mt-4 inline-block rounded-full px-5 py-2.5 text-[13px] font-medium">채널 연결하러 가기</Link>
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
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              최근 초안 <span className="mono text-[var(--color-fg-3)]">{drafts.length}</span>
            </div>
            <Link href="/posts" className="mono text-[12px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg)]">
              전체 글 보기 →
            </Link>
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
                  <p className="mt-2 line-clamp-2 text-[13.5px] font-medium group-hover:text-[var(--color-fg)]">{postDisplayTitle(p)}</p>
                  <p className="mt-2 text-[11px] text-[var(--color-fg-3)]">붙여넣기 도우미 열기 →</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 성과 (실데이터: 리뷰 감정·초안. 도달·조회는 채널 연동 후) */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-medium">
            성과 <span className="mono rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-3)]">실시간</span>
            {/* 리포트는 매일 보는 화면이 아니라 nav 대신 여기서 연결한다(모바일 nav가 이미 빠듯). */}
            <Link
              href="/report"
              className="ml-auto text-[12.5px] font-normal text-[var(--color-fg-3)] transition hover:text-[var(--color-fg)]"
            >
              이번 주 리포트 →
            </Link>
          </div>
          <DashboardPerformance data={perfData} weekly={weekly} feed={feed} />
        </section>

        {/* 이번 주 콘텐츠 계획 (각도 로테이션 미리보기) */}
        <section className="mt-10">
          <WeekPlan plan={plan} />
        </section>

        {/* 홈 화면 추가 — 매일 카톡을 찾아 들어오는 마찰을 없앤다.
            첫 화면을 가리지 않도록 아래에 두고, 닫으면 30일간 다시 묻지 않는다. */}
        <InstallPrompt />
      </main>
    </div>
  );
}
