'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateForStore } from '@/lib/generate';
import { resolvePlaceUrl, placeUrlMessage } from '@/lib/place-url';
import type { ChannelId } from '@shared/channels/registry';
import type { StoreOffering } from '@shared/content-engine/types';
import { CONTENT_CHANNELS, contentChannelsFor } from '@shared/channels/registry';
import { generationFailure } from '@shared/generation-error';

export interface OnboardingPayload {
  storeName: string;
  industryId: string;
  naverPlaceUrl?: string;
  address?: string;
  channels: ChannelId[];
  /** 판매 항목(메뉴·상품·시술) — 첫 글부터 실제 소재로 */
  offerings?: StoreOffering[];
}

export async function completeOnboarding(payload: OnboardingPayload): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };
  if (!payload?.storeName?.trim() || !payload.industryId) return { ok: false, error: '매장 이름과 업종을 먼저 입력해주세요.' };
  const { data: existing, error: existingError } = await supabase.from('stores')
    .select('id,onboarded_at').eq('owner_id', user.id).maybeSingle();
  if (existingError) return { ok: false, error: '매장 정보를 확인하지 못했어요. 다시 시도해주세요.' };
  if (existing?.onboarded_at) redirect('/dashboard');
  const selectedChannels = contentChannelsFor((payload.channels ?? []).filter((id) => CONTENT_CHANNELS.includes(id)));

  // 판매 항목 정제 → brand_tone.offerings (첫 글부터 실제 소재로)
  const offerings: StoreOffering[] = (payload.offerings ?? [])
    .map((o) => ({
      name: (o.name ?? '').trim(),
      price: typeof o.price === 'number' && !Number.isNaN(o.price) ? o.price : undefined,
    }))
    .filter((o) => o.name)
    .slice(0, 40);
  const brandTone = offerings.length ? { offerings } : {};

  // 플레이스 주소는 **저장 전에** 확인한다. 잘못 들어가면 크롤이 매일 조용히 실패하고
  // 사실 없는 글이 계속 나가는데, 사장님은 왜 메뉴·영업시간이 안 들어가는지 모른다.
  // 지도 앱 공유는 naver.me 단축 링크라 서버에서 펼쳐 실제 주소로 정규화한다.
  let placeUrl: string | null = null;
  if ((payload.naverPlaceUrl ?? '').trim()) {
    const checked = await resolvePlaceUrl(payload.naverPlaceUrl);
    if (!checked.ok) return { ok: false, error: placeUrlMessage(checked.reason as 'shortlink' | 'unknown') };
    placeUrl = checked.url;
  }

  const values = {
      owner_id: user.id,
      name: payload.storeName.trim(),
      industry_id: payload.industryId,
      naver_place_url: placeUrl,
      address: payload.address ?? null,
      brand_tone: brandTone,
      channel_blog_enabled: true,
      channel_instagram_enabled: selectedChannels.includes('instagram'),
    };
  const write = existing
    ? supabase.from('stores').update(values).eq('id', existing.id)
    : supabase.from('stores').insert(values);
  const { data: store, error } = await write
    .select('id')
    .single();

  if (error || !store) return { ok: false, error: '매장 저장에 실패했습니다' };

  const { error: channelsError } = await supabase.from('channel_connections').upsert(
    selectedChannels.map((c) => ({ store_id: store.id, channel_id: c, status: 'pending' })),
    { onConflict: 'store_id,channel_id' },
  );
  if (channelsError) return { ok: false, error: '초안 채널을 저장하지 못했어요. 입력은 유지되니 다시 시도해주세요.' };
  const { error: completionError } = await supabase.from('stores').update({ onboarded_at: new Date().toISOString() }).eq('id', store.id);
  if (completionError) return { ok: false, error: '매장 설정을 마무리하지 못했어요. 다시 시도해주세요.' };

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
            naver_place_url: placeUrl,
            address: payload.address ?? null,
            brand_tone: brandTone,
          },
          {
            angle: '우리 매장을 처음 소개하는 따뜻한 첫 인사 글',
            targetLength: 'medium',
            // 온보딩에서 인스타를 켰으면 첫 초안부터 세트로 (데일리 크론과 동일 정책)
            channels: selectedChannels,
          },
        );
      } catch (e) {
        /**
         * 웰컴 드래프트 실패는 온보딩을 막지 않는다(다음날 크론이 만들어준다).
         * 하지만 **조용히 넘기면 안 된다** — 사장님은 가입 첫날 빈 화면을 보는데
         * 우리는 이유를 모른다. 실제로 그 상태를 보고도 원인을 못 짚었다(2026-09-09).
         * 콘솔은 아무도 안 본다(Vercel 로그를 뒤져야 한다) → DB에 남겨 화면·검증이 읽게 한다.
         */
        const failure = generationFailure(e);
        console.error('[onboarding] 웰컴 드래프트 생성 실패:', failure.status);
        try {
          await createServiceClient().from('activity_log').insert({
            store_id: store.id,
            event: 'welcome_draft_failed',
            // 원인을 그대로 남긴다 — 429(쿼터)인지 404(모델 폐기)인지 파싱 실패인지가 갈린다
            detail: { message: failure.message, status: failure.status, at: new Date().toISOString() },
          });
        } catch {
          /* 기록 실패까지 온보딩을 막지는 않는다 */
        }
      }
    });
  }

  redirect('/dashboard');
}
