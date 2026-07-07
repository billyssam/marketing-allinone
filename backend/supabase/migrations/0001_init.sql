-- 마케팅올인원 초기 스키마
-- 2026-07-01

-- ============================================================
-- 업종 프리셋 (Pre-Service-Blog-Instagram과 동일)
-- ============================================================
create table if not exists industries (
  id text primary key,
  name_ko text not null,
  copywriting_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- 매장 (owner_id = 사장님 auth.users)
-- ============================================================
create type subscription_status as enum ('trial', 'active', 'paused', 'cancelled');

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  industry_id text references industries(id),
  naver_place_url text,
  naver_blog_url text,
  naver_blog_id text,               -- e.g. "sykorea20"
  address text,
  brand_tone jsonb default '{}'::jsonb,
  owner_phone text,                 -- 010-xxxx-xxxx (알림톡 수신)
  kakao_channel_uid text,           -- 카카오 채널 친구 UID (알림톡용)
  subscription_status subscription_status not null default 'trial',
  channel_blog_enabled boolean default true,
  channel_instagram_enabled boolean default false,
  channel_alimtalk_enabled boolean default false,
  channel_reviews_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_stores_owner on stores(owner_id);
create index if not exists idx_stores_active on stores(subscription_status);

-- ============================================================
-- 채널 연동 (OAuth 토큰 등)
-- ============================================================
create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  channel text not null,            -- 'instagram' | 'facebook' | 'google_gbp' | 'naver_talktalk'
  external_id text,                 -- e.g. Instagram Business Account ID
  access_token text,                -- 암호화 저장 권장 (M2에서 pgcrypto)
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  metadata jsonb default '{}'::jsonb,
  connected_at timestamptz default now(),
  unique (store_id, channel)
);

-- ============================================================
-- 발행 이력 (채널별)
-- ============================================================
create type post_channel as enum ('blog', 'instagram', 'facebook', 'google_gbp', 'threads');
create type post_status as enum ('draft', 'ready', 'sent_to_owner', 'published', 'failed', 'archived');

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  channel post_channel not null,
  title text,
  body_html text,
  body_plain text,
  tags text[] not null default '{}',
  metadata jsonb default '{}'::jsonb,
  status post_status not null default 'draft',
  scheduled_for timestamptz,
  sent_to_owner_at timestamptz,      -- 카톡 알림 발송 시각
  published_at timestamptz,
  external_url text,                  -- 발행된 URL
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_posts_store_channel on posts(store_id, channel);
create index if not exists idx_posts_status on posts(status);

-- ============================================================
-- 리뷰 모니터링
-- ============================================================
create type review_source as enum ('naver_place', 'baemin', 'yogiyo', 'coupangeats', 'kakaomap');
create type review_sentiment as enum ('positive', 'neutral', 'negative');

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  source review_source not null,
  external_id text not null,          -- 각 플랫폼 리뷰 ID
  author_display text,
  rating int,
  content text not null,
  posted_at timestamptz,
  sentiment review_sentiment,
  sentiment_score numeric(3,2),
  crawled_at timestamptz default now(),
  owner_notified_at timestamptz,     -- 부정 리뷰 알림 발송 시각
  reply_draft text,                    -- AI 답글 초안
  reply_sent_at timestamptz,
  unique (store_id, source, external_id)
);

create index if not exists idx_reviews_store_time on reviews(store_id, posted_at desc);
create index if not exists idx_reviews_negative_pending on reviews(store_id, sentiment, owner_notified_at)
  where sentiment = 'negative';

-- ============================================================
-- 알림톡 템플릿 관리
-- ============================================================
create table if not exists alimtalk_templates (
  id text primary key,               -- 알리고/카카오 템플릿 코드
  purpose text not null,             -- 'daily_blog' | 'review_alert' | 'reactivate' 등
  name text not null,
  body text not null,                -- 승인된 원문
  variables text[],                  -- {{name}}, {{title}} 등
  buttons jsonb,
  approved_at timestamptz,
  active boolean default true
);

-- ============================================================
-- 재방문 유도 (단골 리스트)
-- ============================================================
create table if not exists regulars (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  name text,
  phone text not null,
  last_visit_at timestamptz,
  visit_count int default 0,
  notes text,
  opted_in boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_regulars_store on regulars(store_id);

create table if not exists alimtalk_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  template_id text references alimtalk_templates(id),
  target_type text,                  -- 'regulars_inactive' | 'all' | 'custom'
  target_filter jsonb,
  message_body text,
  status text default 'draft',       -- 'draft' | 'approved' | 'sent' | 'failed'
  sent_count int default 0,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- 감사 로그
-- ============================================================
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  event text not null,
  detail jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_activity_owner_time on activity_log(owner_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table stores enable row level security;
alter table channel_connections enable row level security;
alter table posts enable row level security;
alter table reviews enable row level security;
alter table regulars enable row level security;
alter table alimtalk_campaigns enable row level security;
alter table activity_log enable row level security;

create policy "owner reads own stores" on stores for select
  using (owner_id = auth.uid());
create policy "owner writes own stores" on stores for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner reads own channels" on channel_connections for all
  using (exists (select 1 from stores s where s.id = channel_connections.store_id and s.owner_id = auth.uid()));

create policy "owner reads own posts" on posts for all
  using (exists (select 1 from stores s where s.id = posts.store_id and s.owner_id = auth.uid()));

create policy "owner reads own reviews" on reviews for select
  using (exists (select 1 from stores s where s.id = reviews.store_id and s.owner_id = auth.uid()));

create policy "owner writes own regulars" on regulars for all
  using (exists (select 1 from stores s where s.id = regulars.store_id and s.owner_id = auth.uid()));

create policy "owner reads own campaigns" on alimtalk_campaigns for all
  using (exists (select 1 from stores s where s.id = alimtalk_campaigns.store_id and s.owner_id = auth.uid()));

create policy "owner reads own log" on activity_log for select
  using (owner_id = auth.uid());

-- ============================================================
-- Seed
-- ============================================================
insert into industries (id, name_ko, copywriting_rules) values
  ('cafe', '카페·베이커리', '{"tone": "따뜻·감성적", "keywords": ["원두", "분위기", "디저트"]}'::jsonb),
  ('restaurant', '음식점', '{"tone": "식욕 자극·신선", "keywords": ["재료", "메뉴", "가성비"]}'::jsonb),
  ('vet', '동물병원', '{"tone": "신뢰·전문", "keywords": ["진료", "케어"]}'::jsonb),
  ('beauty', '미용실·네일샵', '{"tone": "세련·트렌디", "keywords": ["스타일", "케어"]}'::jsonb),
  ('gym', '헬스·PT', '{"tone": "동기부여·전문", "keywords": ["운동", "체형", "케어"]}'::jsonb),
  ('kids', '학원·키즈', '{"tone": "신뢰·따뜻", "keywords": ["성장", "교육"]}'::jsonb)
on conflict (id) do nothing;

insert into alimtalk_templates (id, purpose, name, body, variables, active, approved_at) values
  ('PENDING_DAILY_BLOG', 'daily_blog', '오늘의 블로그 초안', '#{매장명} 오늘의 블로그 초안이 준비됐어요! 지금 [보내기]를 누르면 30초 만에 블로그에 올릴 수 있어요.', array['매장명'], false, null),
  ('PENDING_REVIEW_ALERT', 'review_alert', '부정 리뷰 알림', '#{매장명}에 별점 #{별점}점 리뷰가 등록됐어요. 답글 초안을 준비했으니 [답글보내기]를 눌러 확인해주세요.', array['매장명','별점'], false, null),
  ('PENDING_REACTIVATE', 'reactivate', '단골 재방문 유도', '#{고객명}님, 오랜만이에요! #{매장명}에서 #{쿠폰내용} 준비했어요.', array['고객명','매장명','쿠폰내용'], false, null)
on conflict (id) do nothing;
