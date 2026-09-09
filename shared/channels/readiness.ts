import { CHANNELS, type ChannelId } from './registry';

/**
 * 채널이 **사장님 입장에서 지금 어떤 상태인가** — 한 곳에서 정한다.
 *
 * 왜: 레지스트리의 `status`·`automation`은 **우리 계획**이고, `connect`는 **연결 방식**이다.
 * 사장님이 알고 싶은 건 하나뿐이다 — **"지금 내가 뭘 하면 이게 열리는가."**
 * 그 답을 화면마다 각자 계산하면 반드시 어긋난다(이 프로젝트의 반복 결함).
 *
 * 세 갈래로만 나눈다:
 *   ready   — 지금 바로 쓴다. 확장을 깔면 **버튼 하나**로 채워진다(안 깔아도 붙여넣기는 된다).
 *   needsKey— 사장님이 발급한 키를 넣으면 열린다. 심사 없음.
 *   waiting — 우리가 아직 못 연다. 이유를 숨기지 않는다(심사 대기·미구현).
 */
export type Readiness = 'ready' | 'needsKey' | 'waiting';

/**
 * 확장이 글을 직접 채워 넣는 채널 — 공식 글쓰기 API가 없거나 승인이 오래 걸리는 곳들.
 * ⚠️ **레지스트리 id 기준**이다(`naver_blog`·`google_business`).
 *    posts 테이블의 채널명(`blog`·`google_gbp`)과 다르므로 `CHANNEL_TO_POST` 로 변환해 쓴다 —
 *    두 이름을 섞으면 실적이 0으로 보인다.
 */
export const ONE_CLICK: ChannelId[] = [
  'naver_blog', 'naver_place', 'naver_band', 'danggeun', 'kakao_channel', 'google_business',
];

/** 사장님이 직접 발급해 넣는 키로 열리는 채널(심사 없음) */
export const KEY_CHANNELS: {
  id: ChannelId;
  /** 이 키를 넣으면 무엇이 생기는가 — 기능 이름이 아니라 **사장님이 얻는 것** */
  unlocks: string;
  /** 어디서 발급하는가 */
  issuer: string;
  issueUrl: string;
  fields: { key: string; label: string; hint?: string }[];
}[] = [
  {
    id: 'smartstore',
    unlocks: '매출·주문이 매일 자동으로 들어와요',
    issuer: '스마트스토어 판매자센터',
    issueUrl: 'https://sell.smartstore.naver.com/',
    fields: [
      { key: 'clientId', label: '애플리케이션 ID' },
      { key: 'clientSecret', label: '애플리케이션 시크릿' },
    ],
  },
  {
    id: 'kakao_alimtalk',
    unlocks: '단골에게 한 번에 알림톡을 보냅니다',
    issuer: '알리고',
    issueUrl: 'https://smartsms.aligo.in/',
    fields: [
      { key: 'apiKey', label: 'API 키' },
      { key: 'userId', label: '알리고 아이디' },
      { key: 'senderKey', label: '발신프로필 키' },
    ],
  },
];

/**
 * 아직 못 여는 채널의 **진짜 이유**.
 *
 * ⚠️ 하나라도 비면 "아직 준비 중이에요"가 뜬다. 그게 19개 채널에 똑같이 달리면
 * 사장님은 아무것도 알 수 없고, 우리는 정직한 척만 한 것이 된다(화면 문구를 정독하다 발견).
 * 못 여는 이유는 넷뿐이라 넷 다 적을 수 있다 — 심사 / API 없음 / 안 붙임 / 글이 아님.
 */
export const WAITING_REASON: Partial<Record<ChannelId, string>> = {
  // 심사 — 신청하면 열린다
  instagram: 'Meta 심사가 4~6주 걸려요. 신청 준비는 끝났습니다',
  facebook: '인스타와 같은 심사로 함께 열려요',
  threads: '인스타와 같은 심사로 함께 열려요',

  // 사장님용 글쓰기 창구가 아예 없는 곳 — 우리가 뚫을 방법이 없다
  baemin: '배민은 사장님이 글을 넣을 창구를 안 열어둬요',
  yogiyo: '요기요는 사장님이 글을 넣을 창구를 안 열어둬요',
  coupang_eats: '쿠팡이츠는 사장님이 글을 넣을 창구를 안 열어둬요',
  kakao_map: '카카오맵은 플레이스처럼 글을 올릴 수 없어요',

  // 방법은 있는데 아직 안 붙였다 — 정직하게
  coupang: '판매자 연동은 되는데 아직 안 붙였어요',
  eleven_st: '판매자 연동은 되는데 아직 안 붙였어요',
  gmarket: '판매자 연동은 되는데 아직 안 붙였어요',
  self_mall: '카페24·아임웹 연동은 되는데 아직 안 붙였어요',
  kakao_friendtalk: '알림톡부터 열고 그다음이에요',
  sms: '단골 화면에서 문자 앱으로 바로 보내실 수 있어요',
  membership: '쿠폰·스탬프는 아직 안 만들었어요',

  // 글이 아니라 영상 — 이 제품이 만드는 물건이 아니다
  youtube: '영상이라 지금 만드는 글로는 안 돼요',
  tiktok: '영상이라 지금 만드는 글로는 안 돼요',

  // 광고 — 돈이 나가는 일이라 맨 마지막
  naver_ad: '광고비가 나가는 일이라 맨 마지막에 열어요',
  meta_ad: '광고비가 나가는 일이라 맨 마지막에 열어요',
  kakao_moment: '광고비가 나가는 일이라 맨 마지막에 열어요',
  google_ad: '광고비가 나가는 일이라 맨 마지막에 열어요',
};

export function readinessOf(id: ChannelId): Readiness {
  if (ONE_CLICK.includes(id)) return 'ready';
  if (KEY_CHANNELS.some((k) => k.id === id)) return 'needsKey';
  return 'waiting';
}

/** 화면 정렬용 — 사장님이 지금 할 수 있는 것부터 */
export const READINESS_ORDER: Readiness[] = ['ready', 'needsKey', 'waiting'];

export const READINESS_LABEL: Record<Readiness, { title: string; desc: string }> = {
  ready: { title: '바로 씁니다', desc: '매일 글이 준비되고, 확장을 깔면 버튼 하나로 채워집니다' },
  needsKey: { title: '키를 넣으면 열립니다', desc: '사장님이 직접 발급하시면 됩니다. 심사 없이 바로' },
  waiting: { title: '아직 못 엽니다', desc: '열리면 알려드릴게요. 지금은 다른 곳부터 채워요' },
};

/** 레지스트리 전체를 준비도별로 묶는다(planned 도 waiting 에 들어간다) */
export function groupByReadiness(): Record<Readiness, typeof CHANNELS> {
  const out: Record<Readiness, typeof CHANNELS> = { ready: [], needsKey: [], waiting: [] };
  for (const c of CHANNELS) out[readinessOf(c.id)].push(c);
  return out;
}
