import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { ChannelCenter, type ChannelRow } from '@/components/channel-center';
import { resolveBusinessType, recommendedChannelsFor } from '@shared/business/taxonomy';
import { CHANNELS, CHANNEL_TO_POST } from '@shared/channels/registry';
import { readinessOf } from '@shared/channels/readiness';
import { NOT_LIVE_FILTER } from '@shared/posts/status';

export const metadata = { title: '채널 연결' };

export default async function ChannelsPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">사장님 계정으로 로그인하면 채널 연결 센터가 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase.from('stores').select('id, name, industry_id').eq('owner_id', user.id).maybeSingle();
  if (!store) redirect('/onboarding');

  /**
   * 채널마다 **실제 실적**을 붙인다.
   *
   * 왜: "연결됨"이라고 적어 두고 그 채널로 나간 글이 0건이면 그건 거짓말이다.
   * 이 프로젝트는 그걸로 여러 번 데었다(구현 0인 채널 15개가 "완전 자동"으로 떠 있었다).
   * 표시와 실제를 **같은 줄에** 놓으면 거짓말이 불가능해진다.
   */
  const [connsRes, postsRes] = await Promise.all([
    supabase.from('channel_connections').select('channel_id, status, access_token').eq('store_id', store.id),
    supabase.from('posts').select('channel, published_at').eq('store_id', store.id).not('status', 'in', NOT_LIVE_FILTER).limit(2000),
  ]);

  const made = new Map<string, number>();
  const posted = new Map<string, number>();
  for (const p of postsRes.data ?? []) {
    const ch = p.channel as string;
    made.set(ch, (made.get(ch) ?? 0) + 1);
    if (p.published_at) posted.set(ch, (posted.get(ch) ?? 0) + 1);
  }

  /**
   * **우리가 준비를 끝낸 연동**만 고객에게 버튼으로 보인다.
   *
   * Meta 앱 등록·심사는 **운영자가 한 번** 하는 일이고 고객은 그 존재를 모른다.
   * 우리 준비가 안 됐는데 "인스타 연결" 버튼을 보여주면, 눌러도 안 되는 버튼이 된다 —
   * 그러면 고객은 자기가 뭘 잘못한 줄 안다. 서버에서만 판단해 내려준다(키는 나가지 않는다).
   */
  const operatorReady = [
    process.env.META_APP_ID ? 'META_APP_ID' : '',
    process.env.GOOGLE_CLIENT_ID ? 'GOOGLE_CLIENT_ID' : '',
  ].filter(Boolean);

  const conns = new Map((connsRes.data ?? []).map((c) => [c.channel_id as string, c]));
  const rows: ChannelRow[] = CHANNELS.map((c) => {
    const postCh = CHANNEL_TO_POST[c.id];
    const conn = conns.get(c.id);
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      readiness: readinessOf(c.id, operatorReady),
      connected: Boolean(conn),
      hasKey: Boolean(conn?.access_token),
      made: postCh ? (made.get(postCh) ?? 0) : 0,
      posted: postCh ? (posted.get(postCh) ?? 0) : 0,
      writesContent: Boolean(postCh),
    };
  });

  const biz = resolveBusinessType(store.industry_id as string | null);
  const recommended = recommendedChannelsFor(biz) as string[];

  return <ChannelCenter storeName={store.name} rows={rows} recommended={recommended} bizLabel={biz.label} />;
}
