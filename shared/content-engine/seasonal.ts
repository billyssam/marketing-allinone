/**
 * 시점(계절·시의성) 컨텍스트 — 콘텐츠에 "지금 이 시기"를 반영해 전환을 높인다.
 * AI는 오늘이 며칠인지 모른다 → 이 힌트를 프롬프트에 넣어 시의성 있는 글을 쓰게.
 *
 * ⚠️ 음력 명절(설·추석)은 해마다 날짜가 바뀌어 오판 위험 → 넣지 않는다.
 *    양력 고정일·계절만 사용(틀릴 일 없는 것만).
 */
export interface Seasonal {
  month: number; // 1~12
  season: '겨울' | '봄' | '여름' | '가을';
  occasion?: string; // 근접한 양력 이벤트(±5일)
  hint: string; // 프롬프트에 넣을 한 줄
}

function seasonOf(month: number): Seasonal['season'] {
  if (month === 12 || month <= 2) return '겨울';
  if (month <= 5) return '봄';
  if (month <= 8) return '여름';
  return '가을';
}

// 양력 고정 이벤트 (월, 일, 라벨) — ±5일 이내면 언급
const FIXED_OCCASIONS: { m: number; d: number; label: string }[] = [
  { m: 1, d: 1, label: '새해' },
  { m: 2, d: 14, label: '발렌타인데이' },
  { m: 3, d: 1, label: '새 학기' },
  { m: 3, d: 14, label: '화이트데이' },
  { m: 5, d: 5, label: '어린이날' },
  { m: 5, d: 8, label: '어버이날' },
  { m: 5, d: 15, label: '스승의날' },
  { m: 8, d: 15, label: '광복절' },
  { m: 9, d: 1, label: '가을 새 학기' },
  { m: 11, d: 11, label: '빼빼로데이' },
  { m: 12, d: 25, label: '크리스마스' },
  { m: 12, d: 31, label: '연말·송년' },
];

/** 두 (월,일) 사이 대략적 일수 차 (같은 해 가정, 근접 판단용) */
function dayGap(m1: number, d1: number, m2: number, d2: number): number {
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return Math.abs((cum[m1 - 1] + d1) - (cum[m2 - 1] + d2));
}

/**
 * KST 기준 오늘의 시점 컨텍스트.
 * nowMs를 넘겨 결정적으로 테스트 가능.
 */
export function seasonalContext(nowMs: number): Seasonal {
  const kst = new Date(nowMs + 9 * 3600_000);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const season = seasonOf(month);

  let occasion: string | undefined;
  for (const o of FIXED_OCCASIONS) {
    if (dayGap(month, day, o.m, o.d) <= 5) {
      occasion = o.label;
      break;
    }
  }

  const hint = occasion
    ? `지금은 ${month}월, ${season}이고 곧 ${occasion}이에요. 이 시기·분위기를 자연스럽게 살려주세요(억지 홍보 X).`
    : `지금은 ${month}월, ${season}이에요. 이 계절 분위기를 자연스럽게 살려주세요.`;

  return { month, season, occasion, hint };
}
