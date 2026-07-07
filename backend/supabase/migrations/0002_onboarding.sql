-- 온보딩 완료 시각 (온보딩 위저드 → completeOnboarding)
alter table stores add column if not exists onboarded_at timestamptz;

-- 온보딩 미완료 매장 조회용
create index if not exists idx_stores_onboarded on stores(owner_id, onboarded_at);
