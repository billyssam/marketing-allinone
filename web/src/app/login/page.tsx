import { AuthForm } from '@/components/auth-form';

export const metadata = { title: '로그인' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <AuthForm mode="login" />
    </main>
  );
}
