import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getPreparePost } from '@/lib/posts';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 발행 완료 마킹 — /prepare 3단계를 끝낸 초안을 published로.
 * 카톡 딥링크 흐름이라 로그인 세션이 없을 수 있음 → 조회와 동일하게
 * "추측 불가한 UUID를 안다 = 핸드오프 링크 소유자" 모델로 서비스롤 갱신.
 * (draft/ready/sent_to_owner 상태에서만 전이 — 임의 상태 덮어쓰기 방지)
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase가 설정돼 있지 않습니다.' }, { status: 503 });
  }
  let body: { post?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* 아래 검증에서 걸러짐 */
  }
  const postId = body.post ?? '';
  if (!UUID_RE.test(postId)) {
    return NextResponse.json({ error: '초안을 찾을 수 없습니다' }, { status: 404 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', postId)
    .in('status', ['draft', 'ready', 'sent_to_owner'])
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 0행이면 (a)이미 published거나 (b)없는 id다. 둘을 뭉뚱그려 ok를 주면
  // **존재하지 않는 글에도 성공을 반환**한다(실측). 멱등이 필요한 건 (a)뿐이므로 구분한다.
  if (!data) {
    const { data: exists } = await supabase.from('posts').select('id').eq('id', postId).maybeSingle();
    if (!exists) return NextResponse.json({ error: '초안을 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, updated: Boolean(data) });
}

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
