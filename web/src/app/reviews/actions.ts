'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** 답글 발송 완료 체크 — reply_sent_at 마킹 (RLS: 0004 owner update 정책 필요) */
export async function markReplySent(reviewId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('reviews')
    .update({ reply_sent_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) return { error: error.message };

  revalidatePath('/reviews');
  revalidatePath('/dashboard');
  return { ok: true };
}

/** 발송 완료 취소 (실수로 눌렀을 때) */
export async function unmarkReplySent(reviewId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('reviews')
    .update({ reply_sent_at: null })
    .eq('id', reviewId);
  if (error) return { error: error.message };

  revalidatePath('/reviews');
  revalidatePath('/dashboard');
  return { ok: true };
}
