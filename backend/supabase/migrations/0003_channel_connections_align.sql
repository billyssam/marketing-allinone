-- channel_connections를 앱 코드(registry ChannelId + status)에 정렬
-- 기존 컬럼 channel(text) → channel_id, status 컬럼 추가
alter table channel_connections rename column channel to channel_id;
alter table channel_connections add column if not exists status text not null default 'pending';
  -- status: 'pending' | 'connected' | 'error'
