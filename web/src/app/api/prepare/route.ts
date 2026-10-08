import { NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { getPreparePost } from '@/lib/posts';
import { canConfirmPublication, publicationUrl } from '@shared/publication-proof';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 소유자가 외부 게시를 마친 뒤 확인한다. 붙여넣기 완료는 게시 실적이 아니다.
 * 로그인 세션의 RLS 클라이언트만 사용한다. UUID 링크 자체는 접근 권한이 아니다.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Supabase가 설정돼 있지 않습니다.' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: '요청을 확인해주세요' }, { status: 403 });
  let body: { post?: string; confirmed?: boolean; externalUrl?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 형식을 확인해주세요' }, { status: 400 });
  }
  const postId = body?.post ?? '';
  if (typeof postId !== 'string' || !UUID_RE.test(postId)) {
    return NextResponse.json({ error: '초안을 찾을 수 없습니다' }, { status: 404 });
  }

  if (body.confirmed !== true) return NextResponse.json({ error: '실제 게시 후 완료를 확인해주세요' }, { status: 400 });
  const { data: post, error: readError } = await supabase.from('posts')
    .select('id,status,channel,metadata').eq('id', postId).maybeSingle();
  if (readError) return NextResponse.json({ error: '초안 상태를 확인하지 못했어요' }, { status: 500 });
  if (!post) return NextResponse.json({ error: '초안을 찾을 수 없습니다' }, { status: 404 });
  const externalUrl = publicationUrl(body.externalUrl, post.channel);
  if (externalUrl === null) return NextResponse.json({ error: '해당 채널의 HTTPS 게시물 주소를 입력해주세요' }, { status: 400 });
  if (post.status === 'published') return NextResponse.json({ ok: true, updated: false });
  if (!canConfirmPublication(post.status)) return NextResponse.json({ error: '이 초안은 게시 확인으로 바꿀 수 없어요' }, { status: 409 });
  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'published', published_at: at, external_url: externalUrl || null,
      metadata: { ...post.metadata, publicationProof: { mode: 'owner_confirmed', at } } })
    .eq('id', postId)
    .in('status', ['draft', 'ready', 'sent_to_owner'])
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: '게시 확인을 저장하지 못했어요' }, { status: 500 });

  // 읽기와 갱신 사이에 상태가 바뀌면 성공으로 숨기지 않는다.
  if (!data) {
    return NextResponse.json({ error: '초안 상태가 바뀌었어요. 새로고침해주세요' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, updated: Boolean(data) });
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: '서비스 연결을 확인해주세요' }, { status: 503 });
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  const postId = req.nextUrl.searchParams.get('post');
  if (!postId) {
    return NextResponse.json({ error: 'post query 파라미터 필수' }, { status: 400 });
  }

  // 개발용 목업 — Supabase 미설정 환경/데모에서 UI 확인용
  if (postId === 'MOCK' && process.env.NODE_ENV !== 'production') {
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

  // post id는 UUID — 형식이 어긋나면 DB 에러(500) 대신 없는 초안(404)으로 처리
  if (!UUID_RE.test(postId)) {
    return NextResponse.json({ error: '초안을 찾을 수 없습니다', postId }, { status: 404 });
  }

  try {
    const draft = await getPreparePost(supabase, postId);
    if (!draft) {
      return NextResponse.json({ error: '초안을 찾을 수 없습니다', postId }, { status: 404 });
    }
    return NextResponse.json(draft, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return NextResponse.json({ error: '초안을 불러오지 못했어요' }, { status: 500 });
  }
}
