import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { ChannelCenter } from '@/components/channel-center';
import { resolveBusinessType, recommendedChannelsFor } from '@shared/business/taxonomy';

export const metadata = { title: '채널 연결' };

export default async function ChannelsPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">사장님 계정으로 로그인하면 채널 연결 센터가 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase.from('stores').select('id, name, industry_id').eq('owner_id', user.id).maybeSingle();
  if (!store) redirect('/onboarding');

  const { data: conns } = await supabase
    .from('channel_connections')
    .select('channel_id')
    .eq('store_id', store.id);
  const initialConnected = (conns ?? []).map((c) => c.channel_id as string);

  // 이 사업에 맞는 추천 채널 → 센터에서 우선 노출/뱃지
  const biz = resolveBusinessType(store.industry_id as string | null);
  const recommended = recommendedChannelsFor(biz) as string[];

  return <ChannelCenter storeName={store.name} initialConnected={initialConnected} recommended={recommended} bizLabel={biz.label} />;
}
