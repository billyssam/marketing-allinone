/**
 * 시점(계절·시의성) 컨텍스트 — 콘텐츠에 "지금 이 시기"를 반영해 전환을 높인다.
 * AI는 오늘이 며칠인지 모른다 → 이 힌트를 프롬프트에 넣어 시의성 있는 글을 쓰게.
 *
 * ⚠️ 음력 명절(설·추석)은 해마다 날짜가 바뀌어 오판 위험 → 넣지 않는다.
 *    양력 고정일·계절만 사용(틀릴 일 없는 것만).
 */
import { withJosa } from '../korean';

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

/**
 * 오늘로부터 그 (월,일)까지 **남은** 일수. 이미 지났으면 내년 것으로 세므로 큰 값이 된다.
 *
 * 왜 '남은'인가: 문구가 "곧 ~이라"다. 지나간 절기를 잡으면 12/30에 "곧 크리스마스라"가 나간다.
 * 왜 실제 날짜로 세는가: 누적일수 표는 윤년에 하루씩 어긋난다(2028년부터).
 */
function daysUntil(kst: Date, m: number, d: number): number {
  const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  for (const y of [kst.getUTCFullYear(), kst.getUTCFullYear() + 1]) {
    const t = Date.UTC(y, m - 1, d);
    if (t >= today) return Math.round((t - today) / 86_400_000);
  }
  return Number.POSITIVE_INFINITY;
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

  // 가장 가까운 것 하나. 첫 매칭에서 끊으면 목록이 연대순이라 **연중 더 이른 절기가 항상 이긴다**
  // — 5/8(어버이날)에 어린이날이 나왔다. 5월은 자영업 최대 판촉월이라 티가 크다.
  let occasion: string | undefined;
  let nearest = Number.POSITIVE_INFINITY;
  for (const o of FIXED_OCCASIONS) {
    const gap = daysUntil(kst, o.m, o.d);
    if (gap <= 5 && gap < nearest) {
      nearest = gap;
      occasion = o.label;
    }
  }

  const hint = occasion
    ? `지금은 ${month}월, ${season}이고 곧 ${withJosa(occasion, '이에요예요')}. 이 시기·분위기를 자연스럽게 살려주세요(억지 홍보 X).`
    : `지금은 ${month}월, ${season}이에요. 이 계절 분위기를 자연스럽게 살려주세요.`;

  return { month, season, occasion, hint };
}
