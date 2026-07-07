'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  redirect('/dashboard');
}
