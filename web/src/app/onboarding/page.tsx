import { OnboardingWizard } from '@/components/onboarding-wizard';

export const metadata = { title: '시작하기' };

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <OnboardingWizard />
    </main>
  );
}
