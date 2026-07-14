'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateForStore } from '@/lib/generate';
import type { ChannelId } from '@shared/channels/registry';

export interface OnboardingPayload {
  storeName: string;
  industryId: string;
  naverPlaceUrl?: string;
  address?: string;
  channels: ChannelId[];
}

export async function completeOnboarding(payload: OnboardingPayload): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const { data: store, error } = await supabase
    .from('stores')
    .insert({
      owner_id: user.id,
      name: payload.storeName,
      industry_id: payload.industryId,
      naver_place_url: payload.naverPlaceUrl ?? null,
      address: payload.address ?? null,
      onboarded_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !store) return { ok: false, error: '매장 저장에 실패했습니다' };

  if (payload.channels.length) {
    await supabase.from('channel_connections').insert(
      payload.channels.map((c) => ({ store_id: store.id, channel_id: c, status: 'pending' })),
    );
  }

  // 웰컴 드래프트 — 응답 보낸 뒤 백그라운드에서 첫 초안 생성.
  // 신규 사장님이 다음날 아침 크론까지 기다리지 않고 대시보드에서 바로 첫 결과물을 봄.
  // (place_facts는 아직 없어 온보딩 입력만으로 생성 — 크롤 후 다음 글부터 사실 주입)
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) {
    after(async () => {
      try {
        await generateForStore(
          createServiceClient(),
          {
            id: store.id,
            name: payload.storeName,
            industry_id: payload.industryId,
            naver_place_url: payload.naverPlaceUrl ?? null,
            address: payload.address ?? null,
            brand_tone: {},
          },
          { angle: '우리 매장을 처음 소개하는 따뜻한 첫 인사 글', targetLength: 'medium' },
        );
      } catch (e) {
        // 웰컴 드래프트 실패는 온보딩을 막지 않음(다음날 크론이 만들어줌)
        console.error('[onboarding] 웰컴 드래프트 생성 실패:', (e as Error).message);
      }
    });
  }

  redirect('/dashboard');
}
