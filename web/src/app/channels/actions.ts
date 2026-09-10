'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { verifyChannelKey } from '@shared/channels/key-verify';

/**
 * 채널 On/Off → channel_connections 영속화.
 * connect=true: upsert(status='pending'), false: delete. (실제 OAuth/토큰 연동은 채널별 후속)
 * RLS: "owner reads own channels" for all → 소유자만.
 */
export async function toggleChannel(
  channelId: string,
  connect: boolean,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (storeErr) return { error: storeErr.message };
  if (!store) return { error: '매장이 없습니다.' };

  if (connect) {
    const { error } = await supabase
      .from('channel_connections')
      .upsert({ store_id: store.id, channel_id: channelId, status: 'pending' }, { onConflict: 'store_id,channel_id' });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('channel_connections')
      .delete()
      .eq('store_id', store.id)
      .eq('channel_id', channelId);
    if (error) return { error: error.message };
  }

  revalidatePath('/channels');
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * 사장님이 발급한 API 키를 저장한다.
 *
 * ⚠️ 이건 **사장님 소유의 비밀**이다. 다루는 규칙:
 *  - 비밀번호가 아니라 **발급 키**만 받는다(로그인 대행을 하지 않으므로 비밀번호가 필요 없다).
 *  - `channel_connections`에 저장하고 RLS가 매장 소유자만 읽게 막는다.
 *  - **되돌려주지 않는다** — 화면은 "키가 등록돼 있어요"만 알고, 값은 다시 못 읽는다.
 *  - 로그에 찍지 않는다(공개 저장소라 더더욱).
 */
export async function saveChannelKey(
  channelId: string,
  values: Record<string, string>,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
  if (!store) return { error: '매장이 없습니다.' };

  const cleaned = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v),
  );
  if (!Object.keys(cleaned).length) return { error: '값을 입력해주세요.' };

  /**
   * 🔴 저장 전에 **실제로 눌러 본다.**
   * 예전엔 무조건 `status: 'connected'` 로 적었다 — 오타 난 키도 "등록됐어요"가 됐고,
   * 사장님은 지표가 빌 때까지 몰랐다. 확인할 방법이 있으면 확인하고,
   * 없으면 `pending` 으로 정직하게 남긴다(둘을 섞지 않는다).
   */
  const verdict = await verifyChannelKey(channelId, cleaned);
  if (verdict.checked && !verdict.ok) return { error: verdict.error ?? '확인하지 못했어요.' };

  const { error } = await supabase
    .from('channel_connections')
    .upsert(
      {
        store_id: store.id,
        channel_id: channelId,
        status: verdict.checked ? 'connected' : 'pending',
        // 키 묶음은 access_token 에 JSON 으로 — 채널마다 필요한 값 개수가 달라 칸을 나눌 수 없다
        access_token: JSON.stringify(cleaned),
        metadata: {
          savedAt: new Date().toISOString(),
          fields: Object.keys(cleaned),
          verified: verdict.checked,
          ...(verdict.label ? { storeName: verdict.label } : {}),
          ...(verdict.externalId ? { externalId: verdict.externalId } : {}),
        },
      },
      { onConflict: 'store_id,channel_id' },
    );
  if (error) return { error: error.message };

  revalidatePath('/channels');
  revalidatePath('/dashboard');
  return { ok: true };
}
