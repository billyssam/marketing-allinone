import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { daysSince, tierCutoffs } from '@shared/content-engine/reactivation';
import { RegularsManager, type RegularRow } from '@/components/regulars-manager';
import { resolveBusinessType } from '@shared/business/taxonomy';
import { offeringNoun } from '@shared/content-engine/offerings';

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
  const { data: store } = await supabase.from('stores').select('id, name, industry_id').eq('owner_id', user.id).maybeSingle();
  if (!store) redirect('/onboarding');

  const now = Date.now();
  const cut = tierCutoffs(now);
  /**
   * 목록은 500건만(렌더 비용), **요약 수치는 전체 기준**으로 따로 센다.
   *
   * 예전엔 KPI를 이 500건 표본에서 계산했다. 목록이 오래된 방문 순이라
   * 잘려 나가는 쪽이 전부 '활성'이었고, 단골 529명 매장에서
   * "전체 단골 500 · 활성 154(실제 183)"로 떴다(2026-09-08 실측).
   * 사장님은 "몇 명한테 보내야 하나"를 이 숫자로 판단한다 — 표본으로 답하면 안 된다.
   */
  const [rowsRes, totalRes, activeRes, inactiveRes] = await Promise.all([
    supabase
      .from('regulars')
      .select('id, name, phone, last_visit_at, visit_count, opted_in')
      .eq('store_id', store.id)
      .order('last_visit_at', { ascending: true, nullsFirst: true })
      .limit(500),
    supabase.from('regulars').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    supabase.from('regulars').select('id', { count: 'exact', head: true })
      .eq('store_id', store.id).gt('last_visit_at', cut.activeAfter),
    supabase.from('regulars').select('id', { count: 'exact', head: true })
      .eq('store_id', store.id).lte('last_visit_at', cut.inactiveAtOrBefore),
  ]);
  const rows = rowsRes.data;
  const totals = {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    inactive: inactiveRes.count ?? 0,
    // 재방문 대상 = 활성이 아닌 전부(fading·inactive·방문일 미상). 같은 소스에서 뺀다.
    targets: (totalRes.count ?? 0) - (activeRes.count ?? 0),
  };

  const regulars: RegularRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name ?? null) as string | null,
    phone: r.phone as string,
    lastVisitAt: (r.last_visit_at ?? null) as string | null,
    visitCount: (r.visit_count ?? 0) as number,
    daysSince: daysSince(r.last_visit_at as string | null, now),
  }));

  // 혜택 예시를 업종에 맞춘다("아메리카노 1잔 무료"가 미용실 사장님에게 뜨던 문제)
  return (
    <RegularsManager
      storeName={store.name}
      regulars={regulars}
      totals={totals}
      offeringWord={offeringNoun(resolveBusinessType(store.industry_id).offering)}
    />
  );
}
