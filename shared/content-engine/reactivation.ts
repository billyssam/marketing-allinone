/**
 * 재방문 유도 — 끊긴 단골 판별 + 알림톡 메시지 초안.
 * 룰베이스·결정적·이모지 없음(사장님 톤). 발송은 알림톡 credential 연결 후.
 */

export type RegularTier = 'active' | 'fading' | 'inactive' | 'unknown';

/** 마지막 방문 이후 경과일 → 등급 */
export function tierByDays(daysSince: number | null | undefined): RegularTier {
  if (daysSince == null) return 'unknown'; // 방문일 미상 → 유도 후보
  if (daysSince <= 30) return 'active';
  if (daysSince <= 60) return 'fading';
  return 'inactive';
}

/** 재방문 유도 대상 여부 (30일 넘게 안 옴 or 방문일 미상) */
export function isReactivationTarget(daysSince: number | null | undefined): boolean {
  const t = tierByDays(daysSince);
  return t === 'fading' || t === 'inactive' || t === 'unknown';
}

export function daysSince(lastVisitISO: string | null | undefined, nowMs: number): number | null {
  if (!lastVisitISO) return null;
  const then = Date.parse(lastVisitISO);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((nowMs - then) / 86_400_000));
}

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return arr[h % arr.length];
}

export interface ReactivationInput {
  name?: string | null;
  storeName: string;
  daysSince?: number | null;
  /** 사장님이 넣는 혜택 문구 (예: "아메리카노 1잔 무료") */
  benefit?: string;
}

/** 재방문 유도 알림톡 초안 (사장님이 확인/수정 후 발송) */
export function draftReactivation(input: ReactivationInput): string {
  const who = input.name ? `${input.name}님` : '고객님';
  const store = input.storeName;
  const benefit = input.benefit?.trim();
  const seed = (input.name ?? '') + String(input.daysSince ?? 0);

  const openers = [
    `${who}, 오랜만이에요. ${store}입니다.`,
    `${who}, 한동안 뜸하셨네요. ${store}에서 인사드려요.`,
    `${who}, 잘 지내셨어요? 문득 생각나 ${store}가 연락드려요.`,
  ];
  const bodies = benefit
    ? [
        `오랜만에 오시는 김에 ${benefit} 준비해뒀어요.`,
        `다시 뵙고 싶어 ${benefit} 챙겨뒀습니다.`,
      ]
    : [
        `가까운 날 편하게 한번 들러주세요.`,
        `지나는 길에 잠깐 들러주시면 반갑게 맞이할게요.`,
      ];
  const closers = [`기다리고 있을게요. — ${store}`, `언제든 편하게 오세요. — ${store}`];

  return `${pick(openers, seed)} ${pick(bodies, seed + 'b')} ${pick(closers, seed + 'c')}`;
}
