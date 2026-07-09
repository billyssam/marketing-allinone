import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getPreparePost } from '@/lib/posts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post');
  if (!postId) {
    return NextResponse.json({ error: 'post query 파라미터 필수' }, { status: 400 });
  }

  // 개발용 목업 — Supabase 미설정 환경/데모에서 UI 확인용
  if (postId === 'MOCK') {
    return NextResponse.json({
      storeName: '쿵더쿵 카페 (목업)',
      channel: 'blog',
      title: '옥천 안내면 쿵더쿵 카페, 대청호 나들이길 정겨운 쉼터',
      bodyHtml: '<p>대청호의 물길을 따라 굽이굽이 시골길을 달리다 보면...</p>',
      bodyPlain: '대청호의 물길을 따라 굽이굽이 시골길을 달리다 보면, 문득 따뜻한 온기가 그리워지는 순간이 있습니다.',
      tags: ['옥천카페', '대청호카페', '옥천안내면카페', '쿵더쿵카페', '수제대추차'],
      status: 'draft',
    });
  }

  // 이 라우트는 서비스롤로 조회 → SERVICE_ROLE_KEY까지 있어야 함(없으면 친절한 503)
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase가 설정돼 있지 않습니다.' }, { status: 503 });
  }

  // post id는 UUID — 형식이 어긋나면 DB 에러(500) 대신 없는 초안(404)으로 처리
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(postId)) {
    return NextResponse.json({ error: '초안을 찾을 수 없습니다', postId }, { status: 404 });
  }

  try {
    // 카톡 딥링크로 로그인 없이 열릴 수 있어 서비스롤로 UUID 단건 조회
    const draft = await getPreparePost(createServiceClient(), postId);
    if (!draft) {
      return NextResponse.json({ error: '초안을 찾을 수 없습니다', postId }, { status: 404 });
    }
    return NextResponse.json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
