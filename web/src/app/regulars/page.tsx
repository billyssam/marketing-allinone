import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { daysSince } from '@shared/content-engine/reactivation';
import { RegularsManager, type RegularRow } from '@/components/regulars-manager';

export const metadata = { title: '단골 관리' };

export default async function RegularsPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">사장님 계정으로 로그인하면 단골 관리가 열립니다.</p>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase.from('stores').select('id, name').eq('owner_id', user.id).maybeSingle();
  if (!store) redirect('/onboarding');

  const { data: rows } = await supabase
    .from('regulars')
    .select('id, name, phone, last_visit_at, visit_count, opted_in')
    .eq('store_id', store.id)
    .order('last_visit_at', { ascending: true, nullsFirst: true })
    .limit(500);

  const now = Date.now();
  const regulars: RegularRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name ?? null) as string | null,
    phone: r.phone as string,
    lastVisitAt: (r.last_visit_at ?? null) as string | null,
    visitCount: (r.visit_count ?? 0) as number,
    daysSince: daysSince(r.last_visit_at as string | null, now),
  }));

  return <RegularsManager storeName={store.name} regulars={regulars} />;
}
