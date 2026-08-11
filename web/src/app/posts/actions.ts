'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * 발행 취소 — "완료를 눌렀지만 실제로는 안 올린" 경우를 되돌린다.
 *
 * /prepare에서 [완료]를 누르면 published가 되는데, 사장님이 붙여넣기만 하고
 * **블로그 앱에서 발행 버튼을 안 누르는 일**이 실제로 흔하다. 그러면 우리 기록은 '발행됨'인데
 * 실제로는 안 올라갔고, 그 글은 브리핑에서 사라진다.
 * 발행됨 목록엔 external_url이 있을 때만 '보기' 링크가 붙는데 assisted 발행은 그 값이 없어
 * **아무 버튼도 없는 상태**였다 — 되돌릴 방법이 아예 없었다.
 *
 * ⚠️ 이 액션은 캡버빌리티(/prepare)와 달리 **로그인+소유 확인**을 거친다.
 *    RLS가 owner 기준으로 막으므로 서비스롤이 아닌 사용자 클라이언트로 갱신한다.
 */
export async function unpublishPost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'draft', published_at: null })
    .eq('id', postId)
    .eq('status', 'published') // 발행됨만 되돌린다(보관됨을 되살리지 않음)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/posts');
  revalidatePath('/dashboard');
  return { ok: Boolean(data) };
}
