-- ============================================================
-- 0004 · 리뷰 답글 관리 — 사장님 UPDATE 권한
-- ------------------------------------------------------------
-- 크롤 워커는 service_role로 upsert(RLS 우회)하지만,
-- 사장님이 대시보드에서 "답글 발송 완료" 체크(reply_sent_at)나
-- 답글 초안 수정을 하려면 owner UPDATE 정책이 필요하다.
-- (0001에는 reviews가 SELECT 전용이었음)
-- ============================================================

create policy "owner updates own reviews" on reviews for update
  using (exists (select 1 from stores s where s.id = reviews.store_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from stores s where s.id = reviews.store_id and s.owner_id = auth.uid()));
