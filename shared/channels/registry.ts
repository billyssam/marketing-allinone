/**
 * 채널 레지스트리 — 마케팅올인원의 심장.
 * 자영업 온라인 마케팅에서 구현 가능한 전 채널을 플러그인처럼 정의.
 * 사장님은 대시보드에서 필요한 채널만 On/Off. 채널은 계속 추가된다.
 *
 * 각 채널의 automation 등급을 정직하게 표기:
 *  - 'auto'      : 공식 API로 완전 자동 (연결 후 무인 작동)
 *  - 'assisted'  : API 없음 → 크롬확장/딥링크 + 사장님 클릭 1~2회 (30초)
 *  - 'monitor'   : 크롤 기반 읽기(모니터링·분석), 발행 없음
 *  - 'beta'      : 개발 중 / 준비중
 */

export type ChannelId =
  // 유입(획득)
  | 'naver_place' | 'naver_blog' | 'instagram' | 'facebook' | 'danggeun'
  | 'baemin' | 'yogiyo' | 'coupang_eats' | 'google_business' | 'kakao_channel'
  | 'youtube' | 'tiktok' | 'threads' | 'naver_band' | 'kakao_map'
  // 판매(전환)
  | 'smartstore' | 'coupang' | 'eleven_st' | 'gmarket' | 'self_mall'
  // 유지(재방문)
  | 'kakao_alimtalk' | 'kakao_friendtalk' | 'sms' | 'membership'
  // 광고
  | 'naver_ad' | 'meta_ad' | 'kakao_moment' | 'google_ad';

export type ChannelGroup = 'acquire' | 'sell' | 'retain' | 'reputation' | 'ads';
export type Automation = 'auto' | 'assisted' | 'monitor' | 'beta';
export type ChannelStatus = 'live' | 'wip' | 'planned';

export interface ChannelDef {
  id: ChannelId;
  name: string;
  group: ChannelGroup;
  color: string;
  automation: Automation;
  status: ChannelStatus;
  /** 이 채널로 할 수 있는 액션 (대시보드 노출용) */
  actions: string[];
  /** 연결 방식 요약 */
  connect: 'oauth' | 'apikey' | 'extension' | 'crawl' | 'manual';
  /** 개발 우선순위 (낮을수록 먼저) — 임팩트/난이도 종합 */
  priority: number;
  /** 사장님 사전 준비물 (없으면 빈 배열) */
  requires?: string[];
  note?: string;
}

export const GROUPS: Record<ChannelGroup, { label: string; desc: string }> = {
  acquire: { label: '유입', desc: '손님을 데려온다' },
  sell: { label: '판매', desc: '온라인으로 판다' },
  retain: { label: '재방문', desc: '다시 오게 한다' },
  reputation: { label: '평판', desc: '리뷰로 신뢰를 쌓는다' },
  ads: { label: '광고', desc: '유료로 노출을 산다' },
};

export const AUTOMATION_LABEL: Record<Automation, { label: string; color: string }> = {
  auto: { label: '완전 자동', color: '#38e2a4' },
  assisted: { label: '반자동 · 클릭', color: '#ffb534' },
  monitor: { label: '모니터링', color: '#5aa2ff' },
  beta: { label: '준비중', color: '#86847d' },
};

export const CHANNELS: ChannelDef[] = [
  // ===== 유입 =====
  { id: 'naver_place', name: '네이버 플레이스', group: 'acquire', color: '#16d66a', automation: 'assisted', status: 'live', connect: 'extension', priority: 1,
    actions: ['소식 발행', '메뉴·사진 관리', '리뷰 답글', '예약 관리'], note: '지역 검색 노출의 심장' },
  { id: 'naver_blog', name: '네이버 블로그', group: 'acquire', color: '#16d66a', automation: 'assisted', status: 'live', connect: 'extension', priority: 2,
    actions: ['AI 글 발행', '사진 배치', '태그'], note: '크롬확장 30초 발행 (검증됨)' },
  { id: 'instagram', name: '인스타그램', group: 'acquire', color: '#ff4d8d', automation: 'auto', status: 'wip', connect: 'oauth', priority: 3,
    actions: ['피드·릴스·스토리 예약', 'DM 자동응답', '댓글 관리'], requires: ['인스타 프로페셔널 계정', '페이스북 페이지'] },
  { id: 'danggeun', name: '당근마켓', group: 'acquire', color: '#ff7e36', automation: 'assisted', status: 'wip', connect: 'manual', priority: 4,
    actions: ['비즈프로필', '동네 홍보 글', '단골 쿠폰'], note: '동네 장사면 인스타보다 중요' },
  { id: 'google_business', name: '구글 비즈니스', group: 'acquire', color: '#4285f4', automation: 'auto', status: 'wip', connect: 'oauth', priority: 8,
    actions: ['게시물', '리뷰 답글', '영업정보'], note: '외국인·관광 상권 강력' },
  { id: 'kakao_channel', name: '카카오 채널', group: 'acquire', color: '#ffcd3c', automation: 'auto', status: 'wip', connect: 'apikey', priority: 9,
    actions: ['채널 소식', '자동응답'] },
  { id: 'youtube', name: '유튜브 쇼츠', group: 'acquire', color: '#ff3b30', automation: 'auto', status: 'planned', connect: 'oauth', priority: 14,
    actions: ['쇼츠 업로드', '예약 발행'] },
  { id: 'tiktok', name: '틱톡', group: 'acquire', color: '#25f4ee', automation: 'auto', status: 'planned', connect: 'oauth', priority: 15,
    actions: ['영상 발행'] },
  { id: 'threads', name: '스레드', group: 'acquire', color: '#f6f4f0', automation: 'auto', status: 'planned', connect: 'oauth', priority: 16,
    actions: ['글 발행'] },
  { id: 'facebook', name: '페이스북', group: 'acquire', color: '#1877f2', automation: 'auto', status: 'planned', connect: 'oauth', priority: 17,
    actions: ['페이지 게시물'] },
  { id: 'naver_band', name: '네이버 밴드', group: 'acquire', color: '#03c75a', automation: 'assisted', status: 'planned', connect: 'manual', priority: 18,
    actions: ['동네·모임 글'], note: '동네 커뮤니티 장사' },

  // ===== 판매 =====
  { id: 'smartstore', name: '네이버 스마트스토어', group: 'sell', color: '#16d66a', automation: 'auto', status: 'wip', connect: 'apikey', priority: 5,
    actions: ['상품 등록·수정', '주문 관리', '문의 답변', '정산 조회'], requires: ['커머스 API 신청'] },
  { id: 'coupang', name: '쿠팡', group: 'sell', color: '#ff4d4d', automation: 'auto', status: 'planned', connect: 'apikey', priority: 11,
    actions: ['상품·주문', 'CS 답변'], requires: ['쿠팡 판매자 API'] },
  { id: 'coupang_eats', name: '쿠팡이츠', group: 'sell', color: '#ff4d4d', automation: 'assisted', status: 'planned', connect: 'manual', priority: 12,
    actions: ['리뷰 답글', '쿠폰·공지'] },
  { id: 'eleven_st', name: '11번가', group: 'sell', color: '#ff0038', automation: 'auto', status: 'planned', connect: 'apikey', priority: 19 , actions: ['상품·주문'] },
  { id: 'gmarket', name: '지마켓', group: 'sell', color: '#00c73c', automation: 'auto', status: 'planned', connect: 'apikey', priority: 20, actions: ['상품·주문'] },
  { id: 'self_mall', name: '자사몰 (카페24·아임웹)', group: 'sell', color: '#5aa2ff', automation: 'auto', status: 'planned', connect: 'apikey', priority: 21, actions: ['상품·주문 연동'] },

  // ===== 배달(유입+판매 겸) =====
  { id: 'baemin', name: '배달의민족', group: 'sell', color: '#2ac1bc', automation: 'assisted', status: 'wip', connect: 'manual', priority: 6,
    actions: ['리뷰 답글', '사장님 공지', '쿠폰'] },
  { id: 'yogiyo', name: '요기요', group: 'sell', color: '#fa0050', automation: 'assisted', status: 'planned', connect: 'manual', priority: 13,
    actions: ['리뷰 답글', '공지'] },

  // ===== 재방문 =====
  { id: 'kakao_alimtalk', name: '카카오 알림톡', group: 'retain', color: '#ffcd3c', automation: 'auto', status: 'wip', connect: 'apikey', priority: 7,
    actions: ['재방문 유도', '예약 알림', '쿠폰 발송'], requires: ['알림톡 사업자 등록', '템플릿 승인'] },
  { id: 'kakao_friendtalk', name: '카카오 친구톡', group: 'retain', color: '#ffcd3c', automation: 'auto', status: 'planned', connect: 'apikey', priority: 22, actions: ['이벤트·이미지 발송'] },
  { id: 'sms', name: 'SMS·문자', group: 'retain', color: '#86847d', automation: 'auto', status: 'planned', connect: 'apikey', priority: 23, actions: ['문자 마케팅'] },
  { id: 'membership', name: '멤버십·쿠폰·스탬프', group: 'retain', color: '#ffb534', automation: 'auto', status: 'planned', connect: 'apikey', priority: 24, actions: ['단골 적립', '쿠폰'] },

  // ===== 광고 =====
  { id: 'naver_ad', name: '네이버 검색·플레이스 광고', group: 'ads', color: '#16d66a', automation: 'auto', status: 'planned', connect: 'apikey', priority: 25,
    actions: ['파워링크', '플레이스 광고', '입찰 자동화'], requires: ['네이버 광고 계정'] },
  { id: 'meta_ad', name: '인스타·페북 광고', group: 'ads', color: '#ff4d8d', automation: 'auto', status: 'planned', connect: 'oauth', priority: 26, actions: ['타겟 광고 집행'] },
  { id: 'kakao_moment', name: '카카오모먼트 광고', group: 'ads', color: '#ffcd3c', automation: 'auto', status: 'planned', connect: 'apikey', priority: 27, actions: ['카카오 광고'] },
  { id: 'google_ad', name: '구글 광고', group: 'ads', color: '#4285f4', automation: 'auto', status: 'planned', connect: 'oauth', priority: 28, actions: ['검색·디스플레이 광고'] },
];

/** 모니터링 대상(리뷰 크롤) — 발행 채널과 별개로 평판 그룹에서 읽기 */
export const REPUTATION_SOURCES: { id: string; name: string; color: string }[] = [
  { id: 'naver_place', name: '네이버 플레이스', color: '#16d66a' },
  { id: 'baemin', name: '배달의민족', color: '#2ac1bc' },
  { id: 'yogiyo', name: '요기요', color: '#fa0050' },
  { id: 'coupang_eats', name: '쿠팡이츠', color: '#ff4d4d' },
  { id: 'danggeun', name: '당근마켓', color: '#ff7e36' },
  { id: 'google_business', name: '구글', color: '#4285f4' },
  { id: 'kakao_map', name: '카카오맵', color: '#ffcd3c' },
];

/**
 * posts.channel enum — 콘텐츠를 영속화할 수 있는 발행 채널.
 * ⚠️ naver_place·danggeun·naver_band·kakao_channel은 0005 마이그레이션 실행 후 DB에 생긴다.
 *    실행 전에도 코드는 안전: 저장 단계가 채널별 실패를 격리해 미지원 채널만 조용히 스킵하고,
 *    SQL이 실행되는 순간 별도 배포 없이 자동으로 살아난다.
 */
export type PostChannel =
  | 'blog' | 'instagram' | 'facebook' | 'google_gbp' | 'threads'
  | 'naver_place' | 'danggeun' | 'naver_band' | 'kakao_channel';

/**
 * 콘텐츠 엔진 ChannelId → posts.channel enum 매핑.
 * ⚠️ posts.channel이 enum이라 여기 있는 채널만 생성·영속 가능(단일 원천).
 * 당근·밴드·카카오채널 등은 enum 확장 마이그레이션 후 추가(0005 참고).
 */
export const CHANNEL_TO_POST: Partial<Record<ChannelId, PostChannel>> = {
  naver_blog: 'blog',
  instagram: 'instagram',
  facebook: 'facebook',
  google_business: 'google_gbp',
  threads: 'threads',
  // 🔴 네이버 플레이스는 priority 1(최우선)·live·온보딩 기본 추천인데 이 매핑이 없어
  //    콘텐츠가 한 번도 생성되지 않았다(2026-07-27 실측 발견). 소식 글 = 방문 유도의 핵심.
  naver_place: 'naver_place',
  danggeun: 'danggeun',
  naver_band: 'naver_band',
  kakao_channel: 'kakao_channel',
};

/** 콘텐츠 생성+영속 가능한(=enum 매핑 있는) 채널 id 목록 */
export const CONTENT_CHANNELS = Object.keys(CHANNEL_TO_POST) as ChannelId[];

/**
 * 연결된 채널 중 콘텐츠를 생성할 채널을 고른다(적응).
 * 네이버 블로그는 제품의 핵심 산출물이라 항상 포함(anchor).
 * 그 외 연결된 콘텐츠 채널(인스타·페북·구글·스레드)을 추가 → "연결하면 그 채널 글도 나옴".
 */
export function contentChannelsFor(connectedIds: string[]): ChannelId[] {
  const set = new Set<ChannelId>(['naver_blog']);
  for (const id of connectedIds) {
    if (id in CHANNEL_TO_POST) set.add(id as ChannelId);
  }
  return [...set];
}

export function channelsByGroup(group: ChannelGroup) {
  return CHANNELS.filter((c) => c.group === group).sort((a, b) => a.priority - b.priority);
}
export function liveChannels() {
  return CHANNELS.filter((c) => c.status === 'live');
}
export function roadmapOrder() {
  return [...CHANNELS].sort((a, b) => a.priority - b.priority);
}
