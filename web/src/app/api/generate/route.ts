import { NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { persistDrafts } from '@/lib/posts';
import { generateChannelDrafts } from '@shared/content-engine/orchestrator';
import type { ChannelId } from '@shared/channels/registry';
import type { DraftInput, IndustryId, BrandTone, StoreProfile } from '@shared/content-engine/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 요청 body가 채널을 안 주면 이걸로 (블로그=단일 Gemini 호출, 무료티어 절약) */
const DEFAULT_CHANNELS: ChannelId[] = ['naver_blog'];

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
    return NextResponse.json({ error: 'Supabase가 설정돼 있지 않습니다.' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: GenerateBody = {};
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    // body 없이 호출 가능 — 기본값 사용
  }

  // 매장 조회: body.storeId 지정 시 그걸로(소유권은 RLS가 보증), 없으면 내 첫 매장
  const storeQuery = supabase
    .from('stores')
    .select('id, name, industry_id, naver_place_url, naver_blog_url, address, brand_tone')
    .order('created_at', { ascending: true })
    .limit(1);
  if (body.storeId) storeQuery.eq('id', body.storeId);

  const { data: store, error: storeErr } = await storeQuery.maybeSingle();
  if (storeErr) {
    return NextResponse.json({ error: `매장 조회 실패: ${storeErr.message}` }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json(
      { error: '매장이 없습니다. 온보딩을 먼저 완료해주세요.' },
      { status: 404 },
    );
  }

  const profile: StoreProfile = {
    id: store.id,
    name: store.name,
    industryId: (store.industry_id ?? 'cafe') as IndustryId,
    naverPlaceUrl: store.naver_place_url ?? undefined,
    naverBlogUrl: store.naver_blog_url ?? undefined,
    address: store.address ?? undefined,
    brandTone: (store.brand_tone ?? {}) as BrandTone,
  };

  const input: DraftInput = {
    store: profile,
    photos: body.photos ?? [],
    targetLength: body.targetLength,
    angle: body.angle,
  };
  const channels = body.channels?.length ? body.channels : DEFAULT_CHANNELS;

  try {
    const bundle = await generateChannelDrafts(input, channels);
    const posts = await persistDrafts(supabase, store.id, bundle);
    return NextResponse.json({
      storeId: store.id,
      storeName: store.name,
      title: bundle.master.title,
      posts,
      count: posts.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Gemini 무료 한도(429) 등은 그대로 전달해 UI가 안내하도록
    const status = /429|quota|rate/i.test(message) ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
