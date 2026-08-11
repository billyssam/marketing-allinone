'use client';

import { useState, useTransition } from 'react';
import { unpublishPost } from '@/app/posts/actions';

/**
 * "아직 안 올렸어요" — 발행 표시를 되돌려 브리핑으로 돌려보낸다.
 * 실수로 [완료]를 눌렀거나, 붙여넣고 앱에서 발행을 안 눌렀을 때 쓴다.
 */
export function UnpublishButton({ postId }: { postId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) return <span className="mono shrink-0 text-[11px] text-[var(--color-fg-3)]">되돌림</span>;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await unpublishPost(postId);
          if (r.ok) setDone(true);
        })
      }
      className="shrink-0 rounded-full border border-[var(--color-hair-strong)] px-3 py-1.5 text-[12px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg)] disabled:opacity-50"
      title="발행 표시를 되돌려 다시 붙여넣기 목록으로 보냅니다"
    >
      {pending ? '되돌리는 중…' : '아직 안 올렸어요'}
    </button>
  );
}
