import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { DashboardPreview } from '@/components/dashboard-preview';
import { signOut } from '@/app/auth/actions';
import { CHANNELS, AUTOMATION_LABEL, type ChannelId } from '@shared/channels/registry';

export const metadata = { title: '대시보드' };

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
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', user.id).maybeSingle();
  if (!store) redirect('/onboarding');

  const { data: conns } = await supabase.from('channel_connections').select('channel_id, status').eq('store_id', store.id);
  const connected = (conns ?? []).map((c) => c.channel_id as ChannelId);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
            <span className="text-[15px] font-semibold">{store.name}</span>
          </div>
          <nav className="flex items-center gap-5 text-[13px] text-[var(--color-fg-2)]">
            <Link href="/dashboard" className="text-[var(--color-fg)]">대시보드</Link>
            <Link href="/channels" className="hover:text-[var(--color-fg)]">채널 연결</Link>
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
          <Link href="/channels" className="rounded-full border border-[var(--color-hair-strong)] px-4 py-2 text-[13px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]">
            + 채널 추가
          </Link>
        </div>

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
                return (
                  <div key={id} className="panel rounded-[var(--radius)] p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ch.color }} />
                      <span className="text-[13.5px] font-medium">{ch.name}</span>
                    </div>
                    <div className="mono mt-2 text-[10px]" style={{ color: au.color }}>{au.label} · 대기중</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 성과 대시보드 (데이터 쌓이면 실데이터로) */}
        <section className="mt-10">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            성과 <span className="mono rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-3)]">데이터 수집 시작 후 실시간 반영</span>
          </div>
          <div className="panel rounded-[var(--radius-lg)] p-3">
            <DashboardPreview />
          </div>
        </section>
      </main>
    </div>
  );
}
