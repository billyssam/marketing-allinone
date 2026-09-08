/**
 * 재방문 유도 — 끊긴 단골 판별 + 알림톡 메시지 초안.
 * 룰베이스·결정적·이모지 없음(사장님 톤). 발송은 알림톡 credential 연결 후.
 */
import { seasonalContext } from './seasonal';
import { withJosa } from '../korean';

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

/**
 * 같은 등급 기준을 **DB 질의로** 쓰기 위한 시각 경계.
 *
 * 왜 필요한가: 단골 화면은 목록을 500건으로 자르는데, KPI를 그 표본에서 계산하면
 * 단골 529명인 매장에 "전체 단골 500"이라고 뜬다(2026-09-08 실측 — 활성도 183 대신 154).
 * 그래서 KPI는 count 질의로 **전체**를 세야 하는데, 그때 쓰는 시각 경계가
 * `tierByDays`와 어긋나면 화면 숫자가 규칙과 다른 것을 세게 된다.
 * 경계는 여기 한 곳에만 둔다(테스트가 두 정의를 대조한다).
 *
 * 유도: daysSince = floor((now - t)/DAY)
 *   active   ⟺ daysSince ≤ 30 ⟺ t >  now − 31일
 *   inactive ⟺ daysSince > 60 ⟺ t ≤  now − 61일
 */
export function tierCutoffs(nowMs: number): { activeAfter: string; inactiveAtOrBefore: string } {
  const DAY = 86_400_000;
  return {
    activeAfter: new Date(nowMs - 31 * DAY).toISOString(),
    inactiveAtOrBefore: new Date(nowMs - 61 * DAY).toISOString(),
  };
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
  /** 있으면 계절·근접 이벤트를 메시지에 반영(시의성) */
  nowMs?: number;
}

/** 재방문 유도 알림톡 초안 (사장님이 확인/수정 후 발송) */
export function draftReactivation(input: ReactivationInput): string {
  const who = input.name ? `${input.name}님` : '고객님';
  const store = input.storeName;
  const benefit = input.benefit?.trim();
  const occasion = input.nowMs != null ? seasonalContext(input.nowMs).occasion : undefined;
  const seed = (input.name ?? '') + String(input.daysSince ?? 0);

  const openers = occasion
    ? [
        `${who}, 오랜만이에요. 곧 ${withJosa(occasion, '이라라')} 문득 생각났어요. ${store}입니다.`,
        `${who}, ${occasion} 앞두고 안부 전해요. ${withJosa(store, '이에요예요')}.`,
      ]
    : [
        `${who}, 오랜만이에요. ${store}입니다.`,
        `${who}, 한동안 뜸하셨네요. ${store}에서 인사드려요.`,
        `${who}, 잘 지내셨어요? 문득 생각나 ${withJosa(store, '이가')} 연락드려요.`,
      ];

  const bodies = benefit
    ? [
        `오랜만에 오시는 김에 ${benefit} 준비해뒀어요.`,
        `다시 뵙고 싶어 ${benefit} 챙겨뒀습니다.`,
      ]
    : occasion
      ? [
          `${occasion} 맞이 겸 가까운 날 한번 들러주세요.`,
          `이맘때 생각나실 때 편하게 얼굴 비춰주세요.`,
        ]
      : [
          `가까운 날 편하게 한번 들러주세요.`,
          `지나는 길에 잠깐 들러주시면 반갑게 맞이할게요.`,
        ];

  const closers = [`기다리고 있을게요. — ${store}`, `언제든 편하게 오세요. — ${store}`];

  const body = pick(bodies, seed + 'b');
  let closer = pick(closers, seed + 'c');
  // 같은 말이 한 문자메시지에 두 번 나오면 성의 없어 보인다
  // (실측: "가까운 날 **편하게** 한번 들러주세요. 언제든 **편하게** 오세요.")
  // 조합이 seed로 결정되므로 특정 단골에게는 매번 그 조합이 나간다 → 겹치면 다른 맺음말로.
  if (repeatsWord(body, closer, store)) {
    closer = closers.find((c) => !repeatsWord(body, c, store)) ?? closer;
  }
  return `${pick(openers, seed)} ${body} ${closer}`;
}

/** 두 문장이 2글자 이상 어절을 공유하는가(상호명은 맺음말에 항상 들어가므로 제외) */
function repeatsWord(a: string, b: string, exclude: string): boolean {
  const words = (s: string) =>
    s
      .replace(/[.,!?~—-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && w !== exclude);
  const setA = new Set(words(a));
  return words(b).some((w) => setA.has(w));
}
