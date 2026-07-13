'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
