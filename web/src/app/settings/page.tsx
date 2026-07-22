import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { SettingsForm, type StoreForm } from '@/components/settings-form';
import { DangerZone } from '@/components/danger-zone';
import type { StoreOffering } from '@shared/content-engine/types';

export const metadata = { title: '매장 설정' };

export default async function SettingsPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from('stores')
    .select('name, industry_id, naver_place_url, naver_blog_url, address, brand_tone')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) redirect('/onboarding');

  // offerings: 사장님 관리분 우선, 없으면 크롤된 메뉴로 프리필(카페 등 시작점 제공)
  const bt = (store.brand_tone as Record<string, unknown> | null) ?? {};
  const owned = Array.isArray(bt.offerings) ? (bt.offerings as StoreOffering[]) : [];
  const crawledMenu = ((bt.place_facts as { menu?: StoreOffering[] } | undefined)?.menu ?? []) as StoreOffering[];
  const offerings = owned.length ? owned : crawledMenu.map((m) => ({ name: m.name, price: m.price }));

  const form: StoreForm = {
    name: store.name ?? '',
    industryId: store.industry_id ?? 'cafe',
    naverPlaceUrl: store.naver_place_url ?? '',
    naverBlogUrl: store.naver_blog_url ?? '',
    address: store.address ?? '',
    offerings,
  };

  return (
    <div className="min-h-screen">
      <AppHeader storeName={store.name as string} current="/settings" width="2xl" />

      <main className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
        <div className="eyebrow">매장 설정</div>
        <h1 className="h1 mt-2">매장 정보</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">
          언제든 바꿀 수 있어요. 플레이스 주소를 넣으면 리뷰가 매일 자동으로 수집됩니다.
        </p>
        <SettingsForm store={form} />
        <DangerZone />
      </main>
    </div>
  );
}
