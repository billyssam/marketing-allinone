import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
import { availableLoginProviders } from '@/lib/auth-availability';

export const metadata = { title: '로그인' };

export default async function LoginPage() {
  const providers = await availableLoginProviders();
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <Suspense>
        <AuthForm mode="login" providers={providers} />
      </Suspense>
    </main>
  );
}
