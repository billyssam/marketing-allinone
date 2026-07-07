import { NextRequest, NextResponse } from 'next/server';

// TODO(M1 후반): Supabase에서 실제 posts row 조회
// import { getServerSupabase } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get('post');
  if (!postId) {
    return NextResponse.json({ error: 'post query 파라미터 필수' }, { status: 400 });
  }

  // 스텁: 실제 구현 전까지 개발용 목업
  if (postId === 'MOCK') {
    return NextResponse.json({
      storeName: '쿵더쿵 카페 (목업)',
      title: '옥천 안내면 쿵더쿵 카페, 대청호 나들이길 정겨운 쉼터',
      bodyHtml: '<p>대청호의 물길을 따라 굽이굽이 시골길을 달리다 보면...</p>',
      bodyPlain: '대청호의 물길을 따라 굽이굽이 시골길을 달리다 보면, 문득 따뜻한 온기가 그리워지는 순간이 있습니다.',
      tags: ['옥천카페', '대청호카페', '옥천안내면카페', '쿵더쿵카페', '수제대추차'],
    });
  }

  // TODO: 실제 조회
  return NextResponse.json({ error: '초안을 찾을 수 없습니다', postId }, { status: 404 });
}
