'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * 이메일 링크(초대·비밀번호 재설정) 마무리 화면.
 *
 * Supabase 메일 링크는 토큰을 **URL 해시**(`#access_token=…`)로 준다.
 * 해시는 서버로 전송되지 않아 콜백 라우트에서는 볼 수 없다 —
 * 그래서 초대 링크를 누른 사장님이 로그인 화면으로 튕기고 있었다(리허설 실측).
 * 여기서 브라우저가 해시를 읽어 세션을 세우고 원래 목적지로 보낸다.
 */
function FinishInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = params.get('next') || '/dashboard';
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    // 만료·이미 사용된 링크는 해시에 에러로 온다 — 정직하게 안내하고 재요청으로 유도
    const hashErr = hash.get('error_description') || hash.get('error');
    if (hashErr) {
      setError(
        /expired|invalid/i.test(hashErr)
          ? '링크가 만료됐거나 이미 사용됐어요. 다시 요청해주세요.'
          : '로그인 링크를 처리하지 못했어요. 다시 시도해주세요.',
      );
      return;
    }

    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (!access_token || !refresh_token) {
      setError('로그인 정보를 찾지 못했어요. 링크를 다시 눌러주세요.');
      return;
    }

    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error: e }) => {
        if (e) {
          setError('로그인 처리에 실패했어요. 다시 시도해주세요.');
          return;
        }
        // 해시를 남긴 채로 이동하면 다음 화면 주소에 토큰이 붙는다 → 지우고 이동
        window.location.replace(next);
      })
      .catch(() => setError('로그인 처리에 실패했어요. 다시 시도해주세요.'));
  }, [params, router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-5">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="h2">{error}</h1>
            <div className="mt-6 flex flex-col gap-2.5">
              <Link href="/forgot-password" className="btn-primary rounded-full py-3 text-[14px] font-medium">
                링크 다시 받기
              </Link>
              <Link href="/login" className="text-[13px] text-[var(--color-fg-3)] underline underline-offset-2">
                로그인으로 돌아가기
              </Link>
            </div>
          </>
        ) : (
          <p className="text-[14px] text-[var(--color-fg-2)]">로그인 중이에요…</p>
        )}
      </div>
    </main>
  );
}

export default function AuthFinishPage() {
  return (
    <Suspense fallback={<main className="flex min-h-[100dvh] items-center justify-center px-5 text-[14px] text-[var(--color-fg-3)]">로그인 중이에요…</main>}>
      <FinishInner />
    </Suspense>
  );
}
