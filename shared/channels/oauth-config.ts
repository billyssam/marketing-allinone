import type { ChannelId } from './registry';

/**
 * OAuth 채널 설정 — **한 곳에 모은다.**
 *
 * 채널마다 라우트를 따로 만들면 한쪽만 고쳐지고 나머지가 낡는다(이 프로젝트의 반복 결함).
 * 여기 한 줄을 추가하면 `/api/connect/[channel]` 과 콜백이 **자동으로** 그 채널을 다룬다.
 *
 * ⚠️ 여기 값은 전부 **운영자(우리) 앱**의 것이다. 고객은 자기 계정으로 로그인만 한다
 * ([[feedback-operator-vs-customer-setup]] — 3주를 잃은 착각).
 */
export interface OAuthConfig {
  /** 인가 화면 주소 */
  authUrl: string;
  /** 토큰 교환 주소 */
  tokenUrl: string;
  /** 우리 앱 자격증명이 들어 있는 환경변수 이름 */
  clientIdEnv: string;
  clientSecretEnv: string;
  /** 요청할 권한 — 최소만 요청한다(과하면 심사에서 막힌다) */
  scopes: string[];
  /** 이 채널 연결로 함께 열리는 채널들(Meta 앱 하나로 인스타·페북·스레드가 같이 열린다) */
  alsoConnects?: ChannelId[];
  /** 토큰 교환을 POST 폼으로 보내는가(Meta) 아니면 JSON 인가(Google) */
  tokenBody: 'form' | 'json';
}

export const OAUTH_CONFIG: Partial<Record<ChannelId, OAuthConfig>> = {
  instagram: {
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
    // 인스타 발행에 필요한 최소 권한. 심사 대상은 뒤 두 개다.
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'business_management',
    ],
    // Meta 앱 하나를 승인하면 페북 페이지·스레드도 같이 붙는다 — 고객을 세 번 로그인시키지 않는다
    alsoConnects: ['facebook', 'threads'] as ChannelId[],
    tokenBody: 'form',
  },
  google_business: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    scopes: ['https://www.googleapis.com/auth/business.manage'],
    tokenBody: 'form',
  },
};

/** 이 채널이 OAuth 로 붙는가 */
export function oauthConfigOf(channel: string): OAuthConfig | undefined {
  return OAUTH_CONFIG[channel as ChannelId];
}

/** 콜백 주소 — 등록해 둔 것과 **글자 하나까지 같아야** 한다(다르면 조용히 거부된다) */
export function redirectUriFor(origin: string, channel: string): string {
  return `${origin}/api/connect/${channel}/callback`;
}
