import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';

export const metadata = { title: '회원가입' };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </main>
  );
}
