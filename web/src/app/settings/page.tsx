import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { signOut } from '@/app/auth/actions';
import { SettingsForm, type StoreForm } from '@/components/settings-form';

export const metadata = { title: '매장 설정' };

export default async function SettingsPage() {
  const user = isSupabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
          <h1 className="h2">로그인이 필요합니다</h1>
          <Link href="/login" className="btn-primary mt-6 inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold">로그인</Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from('stores')
    .select('name, industry_id, naver_place_url, naver_blog_url, address')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!store) redirect('/onboarding');

  const form: StoreForm = {
    name: store.name ?? '',
    industryId: store.industry_id ?? 'cafe',
    naverPlaceUrl: store.naver_place_url ?? '',
    naverBlogUrl: store.naver_blog_url ?? '',
    address: store.address ?? '',
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
            <span className="text-[15px] font-semibold">{store.name}</span>
          </div>
          <nav className="flex items-center gap-4 text-[13px] text-[var(--color-fg-2)] sm:gap-5">
            <Link href="/dashboard" className="hover:text-[var(--color-fg)]">대시보드</Link>
            <form action={signOut}><button type="submit" className="hover:text-[var(--color-fg)]">로그아웃</button></form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
        <div className="eyebrow">매장 설정</div>
        <h1 className="h1 mt-2">매장 정보</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">
          언제든 바꿀 수 있어요. 플레이스 주소를 넣으면 리뷰가 매일 자동으로 수집됩니다.
        </p>
        <SettingsForm store={form} />
      </main>
    </div>
  );
}
