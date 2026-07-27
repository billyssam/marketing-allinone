import type { ChannelId } from '../channels/registry';

/**
 * 채널 실제 플랫폼 하드 리밋(넘으면 발행 실패·잘림) — 우리 "권장 길이"(brief)와 별개.
 * flash-lite가 권장 길이를 종종 넘기므로(실측: threads 목표 350인데 399), 발행이
 * 깨지지 않도록 플랫폼 하드 리밋에서 안전하게 문장경계 트림한다.
 *  - instagram: 2,200자 (캡션 최대)
 *  - threads: 500자 (게시글 최대 — 초과 시 발행 거부/잘림)
 *  - naver_place / danggeun: 넉넉하지만 방어적 상한
 */
export const PLATFORM_MAX: Partial<Record<ChannelId, number>> = {
  instagram: 2200,
  threads: 500,
  naver_place: 2000,
  danggeun: 1500,
  naver_band: 2000,
  kakao_channel: 1000, // 카카오 채널 텍스트형 메시지 상한
  facebook: 2000, // 플랫폼 상한은 훨씬 크지만 피드에서 잘려 보이므로 실용 상한
  google_business: 1500, // 구글 비즈니스 게시물 상한
};

/**
 * 문장 경계에서 안전하게 트림 — 단어·문장 중간을 자르지 않는다.
 * 문장부호(. ! ? ~ 요., 줄바꿈)를 우선 경계로, 없으면 공백, 그래도 없으면 하드 컷+말줄임.
 */
export function clampCaption(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // 마지막 문장 끝 후보 (한국어 종결 포함)
  const enders = ['. ', '! ', '? ', '~ ', '\n', '.', '!', '?', '요.', '요 '];
  let best = -1;
  for (const e of enders) {
    const i = cut.lastIndexOf(e);
    if (i > best) best = i + e.trimEnd().length;
  }
  if (best > max * 0.6) return cut.slice(0, best).trim();
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + '…';
}

/** 채널 하드 리밋으로 캡션 정리(리밋 없으면 원문 유지) */
export function clampForChannel(channel: ChannelId, text: string): string {
  const max = PLATFORM_MAX[channel];
  return max ? clampCaption(text, max) : text;
}

/**
 * 사실 날조 조기 경보 — 재작성본에 원본에 없던 숫자가 생겼는지.
 * 주소·가격·전화는 전부 숫자라, 원본에 없는 2자리 이상 숫자는 지어낸 값일 확률이 높다.
 * (실측 사고: 재작성이 "…로 123"을 "…로 2330"으로 변형 → 손님이 못 찾아오는 주소 발행)
 * 차단하지 않고 경고만 한다 — 날짜·시간 등 정상 신규 숫자도 있어 오탐 여지가 있기 때문.
 */
export function fabricatedNumbers(master: string, rewritten: string): string[] {
  const nums = (s: string) => new Set((s.match(/\d[\d,]+/g) ?? []).map((n) => n.replace(/,/g, '')));
  const from = nums(master);
  return [...nums(rewritten)].filter((n) => !from.has(n));
}
