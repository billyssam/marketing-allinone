/**
 * 채널 어댑터 공통 인터페이스.
 * 모든 채널(플레이스·인스타·스마트스토어·알림톡…)이 이 계약을 구현하면
 * 대시보드·브리핑·리포트·모니터링에 자동 편입된다.
 *
 * 발행 방식 2가지:
 *  - auto     : 서버가 API로 직접 발행 (사장님 손 X)
 *  - assisted : 서버는 콘텐츠·딥링크만 준비, 사장님이 클립보드 붙여넣기/클릭
 */

import type { ChannelId } from './registry';

export interface StoreContext {
  storeId: string;
  name: string;
  industryId: string;
  brandTone?: Record<string, unknown>;
  naverPlaceUrl?: string;
}

export interface Connection {
  channelId: ChannelId;
  storeId: string;
  status: 'connected' | 'expired' | 'error' | 'pending';
  externalId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface DraftContent {
  title?: string;
  bodyHtml?: string;
  bodyPlain?: string;
  tags?: string[];
  images?: { url: string; alt?: string }[];
  scheduledFor?: string;
  meta?: Record<string, unknown>;
}

export type PublishMode = 'auto' | 'assisted';

export interface PublishResult {
  mode: PublishMode;
  ok: boolean;
  /** auto: 발행된 URL */
  externalUrl?: string;
  /** assisted: 사장님에게 보낼 딥링크 + 클립보드에 담을 내용 */
  handoff?: {
    deeplink: string;
    clipboard: { label: string; text: string }[];
    steps: string[];
  };
  error?: string;
}

export interface Metrics {
  channelId: ChannelId;
  range: { from: string; to: string };
  reach?: number;
  views?: number;
  clicks?: number;
  conversions?: number;
  series?: { date: string; value: number }[];
}

export interface Review {
  externalId: string;
  author?: string;
  rating?: number;
  content: string;
  postedAt?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ChannelAdapter {
  id: ChannelId;
  mode: PublishMode;
  /** 연결 개시 (oauth url 반환 or apikey 검증 or 확장 안내) */
  connect(store: StoreContext, credentials?: Record<string, string>): Promise<Connection>;
  /** 콘텐츠 발행 (auto=서버발행 / assisted=핸드오프 준비) */
  publish(conn: Connection, draft: DraftContent): Promise<PublishResult>;
  /** 성과 지표 (선택) */
  fetchMetrics?(conn: Connection, range: { from: string; to: string }): Promise<Metrics>;
  /** 리뷰 수집 (평판 채널만) */
  fetchReviews?(conn: Connection, range: { from: string; to: string }): Promise<Review[]>;
}

/** 어댑터가 아직 없을 때 던지는 표준 에러 */
export class NotImplementedError extends Error {
  constructor(channelId: string, method: string) {
    super(`[${channelId}] ${method} 미구현 — 로드맵 참조`);
    this.name = 'NotImplementedError';
  }
}
