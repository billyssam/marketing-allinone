/**
 * 글 상태 분류 — **버린 글을 성과로 세지 않기 위해.**
 *
 * 데일리 크론은 같은 날 다시 만들면 이전 초안을 `archived`로 밀어 둔다.
 * 그런데 대시보드의 posts 쿼리에는 그 제외가 **한 군데도 없었다**(`/posts` 화면만 '보관됨' 탭으로 다뤘다).
 * 실측(2026-09-08, 살아있는 글 28 · 보관 8):
 *   "생성한 글" 36(→28) · "이번 주" 22(→14) · **최근 초안 목록에 이미 버린 글이 떠 있었다**
 * 사장님이 그 카드를 누르면 버린 글을 붙여넣게 된다.
 *
 * 기준을 여기 한 곳에 둔다 — 화면마다 각자 적으면 한 곳만 고쳐지고 나머지가 낡는다.
 */

/** 사장님 성과·목록에서 **빼야 하는** 상태. `/posts`의 '보관됨' 탭과 같은 묶음 */
export const ARCHIVED_POST_STATUSES = ['archived', 'failed'] as const;

/** Supabase 필터에 넣을 형태 — `.not('status', 'in', NOT_LIVE_FILTER)` */
export const NOT_LIVE_FILTER = `(${ARCHIVED_POST_STATUSES.join(',')})`;

/** 이 글이 사장님에게 살아있는 글인가 */
export function isLivePost(status: string | null | undefined): boolean {
  return !ARCHIVED_POST_STATUSES.includes((status ?? 'draft') as (typeof ARCHIVED_POST_STATUSES)[number]);
}
