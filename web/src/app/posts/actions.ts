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

/**
 * 초안 손보기 — 사장님이 붙여넣기 전에 제목·본문을 직접 고친다.
 *
 * 왜 필요한가: 지금은 초안이 마음에 안 들 때 **할 수 있는 게 아무것도 없다.**
 * 고칠 수도, 그 자리에서 다시 만들 수도 없다(컴포저는 각도·주제를 골라 새로 만드는 다른 흐름이다).
 * "AI가 쓴 걸 그대로 올리라"는 요구는 사장님이 가장 거부감을 갖는 지점이고,
 * 파일럿 첫날 확실히 나올 요구다.
 *
 * 왜 재생성이 아니라 편집부터인가: 재생성은 Gemini 무료 한도(flash 20/일)를 쓴다.
 * 실제로 오늘도 소진돼 lite로 강등됐다. 사장님이 몇 번만 눌러도 그날 다른 매장 글이 나빠진다.
 * 편집은 비용이 0이고, "가격 하나만 고칠게" 같은 대부분의 요구를 그대로 해결한다.
 *
 * ⚠️ 로그인+소유 확인을 거친다(RLS가 owner 기준으로 막는다). 발행된 글은 고치지 않는다 —
 *    이미 나간 글을 여기서 바꾸면 기록과 실제가 어긋난다.
 */
export async function updatePostDraft(
  postId: string,
  patch: { title?: string | null; bodyPlain?: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const body = patch.bodyPlain?.trim();
  if (body !== undefined && !body) return { ok: false, error: '본문은 비울 수 없어요' };
  if (body && body.length > 20000) return { ok: false, error: '본문이 너무 깁니다' };

  const title = patch.title === undefined ? undefined : (patch.title ?? '').trim().slice(0, 120) || null;

  const { data, error } = await supabase
    .from('posts')
    .update({
      ...(title !== undefined ? { title } : {}),
      ...(body ? { body_plain: body } : {}),
      // 사장님이 손댔다는 흔적 — 나중에 "어떤 글을 고쳐 쓰는가"를 보고 프롬프트를 고칠 근거가 된다
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .in('status', ['draft', 'ready']) // 발행·보관된 글은 건드리지 않는다
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: '이미 발행했거나 보관된 글은 고칠 수 없어요' };
  revalidatePath('/posts');
  revalidatePath('/dashboard');
  revalidatePath('/prepare');
  return { ok: true };
}
