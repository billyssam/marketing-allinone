import { OnboardingWizard } from '@/components/onboarding-wizard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = { title: '시작하기' };
// completeOnboarding 서버액션의 after() 웰컴 드래프트(10~20초)가 잘리지 않게 함수 수명 연장
export const maxDuration = 60;

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');
  const { data: stores, error } = await supabase.from('stores').select('id,onboarded_at').eq('owner_id', user.id).limit(1);
  if (error) throw new Error('매장 정보를 불러오지 못했어요. 다시 시도해주세요.');
  if (stores?.[0]?.onboarded_at) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <OnboardingWizard ownerId={user.id} publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
    </main>
  );
}
