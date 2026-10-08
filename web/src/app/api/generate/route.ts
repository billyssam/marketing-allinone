import { NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { generateForStore } from '@/lib/generate';
import { contentChannelsFor, type ChannelId } from '@shared/channels/registry';
import type { DraftInput } from '@shared/content-engine/types';
import { generationFailure } from '@shared/generation-error';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface GenerateBody {
  storeId?: string;
  channels?: ChannelId[];
  targetLength?: 'short' | 'medium' | 'long';
  angle?: string;
  photos?: DraftInput['photos'];
}

/**
 * 콘텐츠 생성 → posts 영속화.
 * 인증된 사장님의 매장 하나 → Gemini 마스터 1회 생성 → 채널별 재단 → posts(status='draft') 저장.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: '서비스 연결을 확인하고 있어요. 잠시 후 다시 시도해주세요.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: generationFailure('api key not configured').message }, { status: 503 });
  }

  let body: GenerateBody = {};
  try {
    const parsed = await req.json();
    // null/원시값 바디 방어 — 객체일 때만 채택(그 외엔 기본값)
    if (parsed && typeof parsed === 'object') body = parsed as GenerateBody;
  } catch {
    // body 없이 호출 가능 — 기본값 사용
  }

  // 매장 조회: body.storeId 지정 시 그걸로(소유권은 RLS가 보증), 없으면 내 첫 매장
  const storeQuery = supabase
    .from('stores')
    .select(
      'id, name, industry_id, naver_place_url, naver_blog_url, address, brand_tone, channel_blog_enabled, channel_instagram_enabled',
    )
    .order('created_at', { ascending: true })
    .limit(1);
  if (body.storeId) storeQuery.eq('id', body.storeId);

  const { data: store, error: storeErr } = await storeQuery.maybeSingle();
  if (storeErr) {
    return NextResponse.json({ error: '매장 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json(
      { error: '매장이 없습니다. 온보딩을 먼저 완료해주세요.' },
      { status: 404 },
    );
  }

  // 수동 생성 일일 상한 — 한 매장이 연타로 Gemini 무료 쿼터(flash 20/일)를 고갈시키면
  // 다른 매장의 아침 크론 품질까지 죽는다(멀티테넌트 공정성). 크론 생성(auto:daily)은 제외.
  const MANUAL_DAILY_LIMIT = 8;
  const kstDayStart = new Date(
    Math.floor((Date.now() + 9 * 3600_000) / 86_400_000) * 86_400_000 - 9 * 3600_000,
  ).toISOString();
  const { count: manualToday, error: countError } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', store.id)
    .eq('channel', 'blog')
    .gte('created_at', kstDayStart)
    .or('metadata->>auto.is.null,metadata->>auto.neq.daily');
  if (countError) return NextResponse.json({ error: '생성 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.' }, { status: 503 });
  if ((manualToday ?? 0) >= MANUAL_DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: `오늘 직접 생성 한도(${MANUAL_DAILY_LIMIT}회)를 다 썼어요. 내일 아침 자동 초안이 준비되고, 한도도 다시 채워져요.`,
      },
      { status: 429 },
    );
  }

  // 재시도도 설정 화면의 선택을 사용한다. 이전 플래그는 해제 후에도 남을 수 있다.
  let channels = body.channels;
  if (!channels?.length) {
    const { data: selections, error: selectionsError } = await supabase.from('channel_connections')
      .select('channel_id').eq('store_id', store.id);
    if (selectionsError) return NextResponse.json({ error: '선택한 초안 채널을 확인하지 못했어요. 잠시 후 다시 시도해주세요.' }, { status: 503 });
    channels = contentChannelsFor((selections ?? []).map((selection) => selection.channel_id));
  }

  try {
    const { title, posts } = await generateForStore(supabase, store, {
      channels,
      targetLength: body.targetLength,
      angle: body.angle,
      photos: body.photos,
    });
    return NextResponse.json({
      storeId: store.id,
      storeName: store.name,
      title,
      posts,
      count: posts.length,
    });
  } catch (err) {
    const failure = generationFailure(err);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
