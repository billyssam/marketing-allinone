import { OnboardingWizard } from '@/components/onboarding-wizard';

export const metadata = { title: '시작하기' };
// completeOnboarding 서버액션의 after() 웰컴 드래프트(10~20초)가 잘리지 않게 함수 수명 연장
export const maxDuration = 60;

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <OnboardingWizard />
    </main>
  );
}
