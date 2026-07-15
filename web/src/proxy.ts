import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next 16에서 `middleware` 파일 규칙은 deprecated → `proxy`로 이름만 바뀜(동작 동일).
// 하는 일: 라우트 렌더 전에 Supabase 세션 쿠키를 갱신하고 보호 경로를 가드.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
