'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function ownerStore() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' as const };
  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
  if (!store) return { error: '매장이 없습니다.' as const };
  return { supabase, storeId: store.id as string };
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export async function addRegular(input: {
  name: string;
  phone: string;
  lastVisit?: string; // YYYY-MM-DD
}): Promise<{ ok?: true; error?: string }> {
  const ctx = await ownerStore();
  if ('error' in ctx) return { error: ctx.error };

  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (phone.length < 9 || phone.length > 11) return { error: '전화번호를 확인해주세요 (숫자 9~11자리).' };

  const { error } = await ctx.supabase.from('regulars').insert({
    store_id: ctx.storeId,
    name: name || null,
    phone,
    last_visit_at: input.lastVisit ? `${input.lastVisit}T00:00:00+09:00` : null,
    opted_in: true,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: '이미 등록된 번호예요.' };
    return { error: error.message };
  }
  revalidatePath('/regulars');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function deleteRegular(id: string): Promise<{ ok?: true; error?: string }> {
  const ctx = await ownerStore();
  if ('error' in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.from('regulars').delete().eq('store_id', ctx.storeId).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/regulars');
  revalidatePath('/dashboard');
  return { ok: true };
}
