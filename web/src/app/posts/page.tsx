import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { postDisplayTitle } from '@/lib/posts';
import { relTime } from '@/lib/activity';

export const metadata = { title: '글 보관함' };

/**
 * 글 보관함 — 이 매장에서 만들어진 모든 글의 단일 목록.
 * 지금까지 초안은 브리핑에만 보이고, 발행·보관된 글은 어디서도 볼 수 없었음.
 * 파일럿 사장님이 "내가 뭘 발행했더라"를 확인할 수 있어야 서비스를 신뢰함.
 */

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'draft', label: '대기 중' },
  { key: 'published', label: '발행됨' },
  { key: 'archived', label: '보관됨' },
];

/** DB 상태 → 필터 그룹 (draft·ready·sent_to_owner = 아직 발행 전 대기) */
function groupOf(status: string): StatusFilter {
  if (status === 'published') return 'published';
  if (status === 'archived' || status === 'failed') return 'archived';
  return 'draft';
}

const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  ready: '준비됨',
  sent_to_owner: '전송됨',
  published: '발행됨',
  failed: '실패',
  archived: '보관됨',
};

const CHANNEL_META: Record<string, { label: string; color: string }> = {
  blog: { label: '블로그', color: 'var(--color-naver)' },
  instagram: { label: '인스타', color: 'var(--color-ig)' },
  facebook: { label: '페이스북', color: '#4285f4' },
  google_gbp: { label: '구글', color: '#4285f4' },
  threads: { label: '스레드', color: 'var(--color-fg-2)' },
};

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;
  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">사장님 계정으로 로그인하면 글 보관함이 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from('stores')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) redirect('/onboarding');

  const { status: rawStatus } = await searchParams;
  const filter: StatusFilter = (FILTERS.some((f) => f.key === rawStatus) ? rawStatus : 'all') as StatusFilter;

  // 그룹 → DB status 목록 (groupOf의 역방향, 단일 원천)
  const DRAFT_STATUSES = ['draft', 'ready', 'sent_to_owner'];
  const ARCHIVED_STATUSES = ['archived', 'failed'];
  const statusesFor = (g: StatusFilter) =>
    g === 'published' ? ['published'] : g === 'archived' ? ARCHIVED_STATUSES : DRAFT_STATUSES;

  const LIST_LIMIT = 100;
  const base = () => supabase.from('posts').select('id', { count: 'exact', head: true }).eq('store_id', store.id);
  // 목록은 **선택된 필터 안에서** 가져온다. 전체 200건을 받아 걸러내면
  // 필터를 걸수록 보이는 글이 줄어드는 이상한 동작이 된다.
  // 카운트는 전체 기준 count 쿼리 — 글이 limit을 넘는 순간 표본이 곧 전체가 되던 문제 제거.
  const listQuery = supabase
    .from('posts')
    .select('id, channel, title, body_plain, status, metadata, created_at, published_at, external_url')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (filter !== 'all') listQuery.in('status', statusesFor(filter));

  const [rowsRes, allRes, draftRes, pubRes, archRes] = await Promise.all([
    listQuery,
    base(),
    base().in('status', DRAFT_STATUSES),
    base().eq('status', 'published'),
    base().in('status', ARCHIVED_STATUSES),
  ]);

  const posts = rowsRes.data ?? [];
  const now = Date.now();
  const visible = posts;

  const counts: Record<StatusFilter, number> = {
    all: allRes.count ?? 0,
    draft: draftRes.count ?? 0,
    published: pubRes.count ?? 0,
    archived: archRes.count ?? 0,
  };
  const hiddenCount = Math.max(0, counts[filter] - visible.length);

  return (
    <div className="min-h-screen">
      <AppHeader storeName={store.name as string} current="/posts" />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">posts</div>
            <h1 className="h2 mt-2">글 보관함</h1>
            <p className="mt-1.5 text-[14px] text-[var(--color-fg-2)]">
              자동·수동으로 만들어진 모든 글이 여기 모입니다. 대기 중인 글은 바로 붙여넣기로.
            </p>
          </div>
        </div>

        {/* 상태 필터 — 서버 렌더 링크 칩 (JS 불필요, 새로고침에도 상태 유지) */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Link
                key={f.key}
                href={f.key === 'all' ? '/posts' : `/posts?status=${f.key}`}
                className={`mono rounded-full px-3.5 py-1.5 text-[12px] transition ${
                  active
                    ? 'bg-[var(--color-fg)] font-medium text-[var(--color-bg)]'
                    : 'border border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'
                }`}
              >
                {f.label} <span className={active ? 'opacity-60' : 'text-[var(--color-fg-4)]'}>{counts[f.key]}</span>
              </Link>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="panel mt-6 rounded-[var(--radius-lg)] p-12 text-center">
            <p className="text-[14px] text-[var(--color-fg-2)]">
              {filter === 'all' ? '아직 만들어진 글이 없어요. 매일 아침 자동으로 채워집니다.' : '이 상태의 글이 없어요.'}
            </p>
            {filter === 'all' && (
              <Link href="/dashboard" className="btn-primary mt-5 inline-block rounded-full px-5 py-2.5 text-[13px] font-medium">
                대시보드에서 첫 글 만들기
              </Link>
            )}
          </div>
        ) : (
          <div className="panel mt-6 divide-y divide-[var(--color-hair)] rounded-[var(--radius-lg)]">
            {visible.map((p) => {
              const ch = CHANNEL_META[p.channel as string] ?? { label: p.channel as string, color: 'var(--color-fg-3)' };
              const group = groupOf(p.status as string);
              const isAuto = (p.metadata as { auto?: string } | null)?.auto === 'daily';
              return (
                <div key={p.id as string} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
                  <span
                    className="mono shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: `color-mix(in srgb, ${ch.color} 14%, transparent)`, color: ch.color }}
                  >
                    {ch.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{postDisplayTitle(p as { title?: string | null; body_plain?: string | null })}</div>
                    <div className="mono mt-0.5 text-[11px] text-[var(--color-fg-3)]">
                      {relTime(p.created_at as string, now)}
                      {isAuto && ' · 자동 생성'}
                      {group === 'published' && p.published_at ? ` · ${relTime(p.published_at as string, now)} 발행` : ''}
                    </div>
                  </div>
                  <span
                    className={`mono shrink-0 text-[11px] ${
                      group === 'published' ? 'text-[var(--color-good)]' : group === 'archived' ? 'text-[var(--color-fg-4)]' : 'text-[var(--color-amber)]'
                    }`}
                  >
                    {STATUS_LABEL[p.status as string] ?? (p.status as string)}
                  </span>
                  {group === 'draft' && (
                    <Link
                      href={`/prepare?post=${p.id}`}
                      className="btn-primary shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium"
                    >
                      붙여넣기 →
                    </Link>
                  )}
                  {group === 'published' && p.external_url && (
                    <a
                      href={p.external_url as string}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-full border border-[var(--color-hair-strong)] px-3.5 py-1.5 text-[12px] text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
                    >
                      보기 ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hiddenCount > 0 && (
          <p className="mt-4 text-center text-[12.5px] text-[var(--color-fg-3)]">
            최근 {visible.length.toLocaleString()}건을 보여드리고 있어요. 지난 글 {hiddenCount.toLocaleString()}건도 위 숫자에는 포함돼 있습니다.
          </p>
        )}

        {posts.length >= 200 && (
          <p className="mono mt-3 text-[11px] text-[var(--color-fg-4)]">최근 200건까지 표시됩니다.</p>
        )}
      </main>
    </div>
  );
}
