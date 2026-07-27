-- 0005: 콘텐츠 발행 채널 확장 (네이버 플레이스·당근마켓·네이버밴드·카카오채널)
--
-- 왜: posts.channel enum이 blog/instagram/facebook/google_gbp/threads 5개뿐이라
--     그 외 채널은 콘텐츠를 생성·영속화할 수 없었음. 한국 자영업자에게 중요한
--     당근·밴드·카카오채널을 붙여넣기(assisted) 방식으로 열기 위한 enum 확장.
--
-- 🔴 2026-07-27 추가: **네이버 플레이스**가 이 목록에서 빠져 있었음.
--     플레이스는 registry에서 priority 1(최우선)·status live·온보딩 기본 추천 채널인데
--     enum·매핑이 없어 콘텐츠가 단 한 번도 생성되지 않았다(실측 확인).
--     플레이스 '소식'은 검색 유입 후 방문 결정에 직접 닿는 자리 → 최우선으로 열어야 함.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
--       (ALTER TYPE ... ADD VALUE 는 트랜잭션 밖에서 실행돼야 하므로 한 줄씩 순차 실행)
--
-- 이 마이그레이션 후 코드 쪽 3곳만 추가하면 즉시 반영(포매터는 이미 지원):
--   1) shared/channels/registry.ts CHANNEL_TO_POST 에 매핑 추가
--        danggeun: 'danggeun', naver_band: 'naver_band', kakao_channel: 'kakao_channel'
--   2) web/src/lib/posts.ts POST_CHANNEL_LABEL / POST_CHANNEL_COLOR 에 라벨·색 추가
--   3) PostChannel 타입에 값 추가(shared/channels/registry.ts)
--   → contentChannelsFor·generate-daily·prepare·글보관함이 전부 자동 반영.

alter type post_channel add value if not exists 'naver_place';
alter type post_channel add value if not exists 'danggeun';
alter type post_channel add value if not exists 'naver_band';
alter type post_channel add value if not exists 'kakao_channel';
