import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Supabase 환경변수 설정 여부 — 키 없을 때 앱이 죽지 않도록 가드 */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** 서버(RSC·라우트 핸들러·서버액션)용 Supabase 클라이언트 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // RSC에서 호출된 경우 — 미들웨어가 세션 갱신을 담당하므로 무시
          }
        },
      },
    },
  );
}

/** 서비스 롤 (RLS 우회) — 서버 전용, 크론·관리 작업용. 절대 클라이언트 노출 금지 */
export function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
