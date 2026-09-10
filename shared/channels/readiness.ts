import { CHANNELS, type ChannelId } from './registry';

/**
 * 채널이 **고객(사장님) 입장에서 지금 어떤 상태인가** — 한 곳에서 정한다.
 *
 * 왜: 레지스트리의 `status`·`automation`은 **우리 계획**이고, `connect`는 **연결 방식**이다.
 * 고객이 알고 싶은 건 하나뿐이다 — **"지금 내가 뭘 하면 이게 열리는가."**
 * 그 답을 화면마다 각자 계산하면 반드시 어긋난다(이 프로젝트의 반복 결함).
 *
 * 네 갈래:
 *   oauth   — 버튼 눌러 자기 계정 로그인. 붙으면 **진짜 자동 발행**(확장도 붙여넣기도 없음)
 *   ready   — 매일 글이 준비된다. 확장을 깔면 버튼 하나, 안 깔아도 붙여넣기로 된다
 *   needsKey— 고객만 발급할 수 있는 키를 넣으면 열린다
 *   waiting — 우리가 아직 못 연다. 이유를 숨기지 않되 **우리 사정은 적지 않는다**
 */
/**
 * 🔴 **누가 무엇을 하는가**를 먼저 못 박는다. 여기서 한 번 틀리면 화면 전체가 틀린다.
 *
 * 처음에 이걸 뒤집어 놨었다 — 고객에게 "Meta App ID 대기"라고 보여주고 있었다.
 * App ID 는 **우리가 한 번 등록하는 우리 앱**이고, 고객은 그 존재를 평생 몰라야 한다.
 * 알림톡도 같다: 알리고 계정은 우리 것이고, 고객 것은 자기 카카오 채널뿐이다.
 *
 *   운영자(우리)가 한 번   : Meta 앱 등록·심사, Google Cloud 프로젝트, 알리고 계정
 *                          → 환경변수로 서버에 둔다. 고객 화면에 나오지 않는다.
 *   고객이 매장마다        : 버튼 눌러 자기 계정으로 로그인(OAuth), 또는
 *                          자기만 발급할 수 있는 키(스마트스토어 판매자 키) 입력
 */
export type Readiness = 'ready' | 'oauth' | 'needsKey' | 'waiting';

/**
 * 확장이 글을 직접 채워 넣는 채널 — 공식 글쓰기 API가 없거나 승인이 오래 걸리는 곳들.
 * ⚠️ **레지스트리 id 기준**이다(`naver_blog`·`google_business`).
 *    posts 테이블의 채널명(`blog`·`google_gbp`)과 다르므로 `CHANNEL_TO_POST` 로 변환해 쓴다 —
 *    두 이름을 섞으면 실적이 0으로 보인다.
 */
export const ONE_CLICK: ChannelId[] = [
  'naver_blog', 'naver_place', 'naver_band', 'danggeun', 'kakao_channel', 'google_business',
];

/**
 * **고객이 버튼 한 번으로 연결하는 채널** — 우리 앱에 로그인시키는 방식(OAuth).
 *
 * 고객은 자기 인스타·구글 계정으로 로그인만 한다. 앱 등록·심사는 **우리가 이미 끝내 둔다.**
 * `ready` 가 아니라 따로 두는 이유: 확장을 깔 필요가 없고, 붙는 순간 **진짜 자동 발행**이 된다.
 */
export const OAUTH_CHANNELS: {
  id: ChannelId;
  /** 연결하면 고객이 얻는 것 */
  unlocks: string;
  /** 우리 쪽 준비가 끝났는가 — 안 끝났으면 버튼 대신 "곧 열려요"를 보여준다 */
  operatorReadyEnv: string;
}[] = [
  { id: 'instagram', unlocks: '붙여넣기 없이 인스타에 바로 올라가요', operatorReadyEnv: 'META_APP_ID' },
  { id: 'facebook', unlocks: '페이스북 페이지에 함께 올라가요', operatorReadyEnv: 'META_APP_ID' },
  { id: 'threads', unlocks: '스레드에도 함께 올라가요', operatorReadyEnv: 'META_APP_ID' },
  { id: 'google_business', unlocks: '구글 지도 소식에 바로 올라가요', operatorReadyEnv: 'GOOGLE_CLIENT_ID' },
];

/**
 * 키를 저장하기 전에 **실제로 눌러 볼 수 있는** 채널.
 *
 * 화면 문구가 이 목록을 따라간다 — 확인을 안 하면서 "확인하는 중"이라고 적으면
 * 그 자체가 거짓말이다(전에 그랬다). 실제 확인 로직은 `key-verify.ts` 에 있는데,
 * 그건 bcrypt 를 끌고 오므로 **브라우저로 가는 이 파일에는 이름만** 둔다.
 */
export const VERIFIABLE_KEY_CHANNELS: string[] = ['smartstore'];

export function canVerifyKey(channelId: string): boolean {
  return VERIFIABLE_KEY_CHANNELS.includes(channelId);
}

/**
 * **고객만 발급할 수 있는 키**가 필요한 채널.
 * ⚠️ 우리 계정 정보를 고객에게 묻지 않는다 — 그건 서버 환경변수에 있다.
 */
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
    issuer: '카카오 비즈니스',
    issueUrl: 'https://business.kakao.com/',
    /**
     * ⚠️ 여기서 **우리 알리고 계정 정보를 묻지 않는다.** 발송 계정은 서버 환경변수에 있다.
     * 고객 것은 **자기 카카오 채널**뿐이다 — 채널 검색용 아이디 하나면 발신프로필을 붙일 수 있다.
     * (처음엔 알리고 API 키·아이디까지 고객에게 물어보게 만들어 놨었다. 완전히 틀린 설계였다)
     */
    fields: [
      { key: 'kakaoChannelId', label: '카카오 채널 검색용 아이디', hint: '@로 시작하는 채널 아이디' },
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
  /**
   * ⚠️ 여기 문구는 **고객이 읽는다.** 우리 사정(App ID·심사 진행 상황)을 적지 않는다 —
   * 고객은 그게 뭔지 알 필요가 없고, 알아도 할 수 있는 게 없다.
   * "언제쯤 되는가"만 말한다.
   */
  instagram: '곧 열려요. 열리면 로그인 한 번으로 연결됩니다',
  facebook: '인스타와 함께 열려요',
  threads: '인스타와 함께 열려요',
  google_business: '곧 열려요. 열리면 로그인 한 번으로 연결됩니다',

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

/**
 * @param operatorReady 우리 앱 등록이 끝난 환경변수 이름들(서버에서만 판단해 넘긴다).
 *   비어 있으면 OAuth 채널은 `waiting` 으로 떨어진다 — 고객에게 눌러도 안 되는 버튼을 보이지 않는다.
 */
export function readinessOf(id: ChannelId, operatorReady: string[] = []): Readiness {
  if (ONE_CLICK.includes(id)) return 'ready';
  const oauth = OAUTH_CHANNELS.find((o) => o.id === id);
  if (oauth) return operatorReady.includes(oauth.operatorReadyEnv) ? 'oauth' : 'waiting';
  if (KEY_CHANNELS.some((k) => k.id === id)) return 'needsKey';
  return 'waiting';
}

/** 화면 정렬용 — 고객이 지금 할 수 있는 것부터 */
export const READINESS_ORDER: Readiness[] = ['oauth', 'ready', 'needsKey', 'waiting'];

export const READINESS_LABEL: Record<Readiness, { title: string; desc: string }> = {
  // 가장 좋은 상태를 맨 위에 — 붙여넣기도 확장도 필요 없다
  oauth: { title: '한 번 연결하면 자동', desc: '계정으로 로그인만 하시면, 다음부터 알아서 올라갑니다' },
  ready: { title: '바로 씁니다', desc: '매일 글이 준비되고, 확장을 깔면 버튼 하나로 채워집니다' },
  needsKey: { title: '키를 넣으면 열립니다', desc: '사장님만 발급할 수 있는 값이라 한 번만 부탁드려요' },
  waiting: { title: '아직 못 엽니다', desc: '열리면 알려드릴게요. 지금은 다른 곳부터 채워요' },
};

/** 레지스트리 전체를 준비도별로 묶는다(planned 도 waiting 에 들어간다) */
export function groupByReadiness(): Record<Readiness, typeof CHANNELS> {
  const out: Record<Readiness, typeof CHANNELS> = { oauth: [], ready: [], needsKey: [], waiting: [] };
  for (const c of CHANNELS) out[readinessOf(c.id)].push(c);
  return out;
}
