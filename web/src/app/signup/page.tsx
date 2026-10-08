import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
import { availableLoginProviders } from '@/lib/auth-availability';

export const metadata = { title: '회원가입' };

export default async function SignupPage() {
  const providers = await availableLoginProviders();
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <Suspense>
        <AuthForm mode="signup" providers={providers} />
      </Suspense>
    </main>
  );
}
