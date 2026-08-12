/**
 * 대시보드 넛지 선택 — "지금 이 사장님에게 가장 효과 큰 한 가지"를 고른다.
 *
 * 왜 하나만 고르는가: 주황 줄이 두 개면 무엇부터인지 알 수 없다.
 * 사장님은 화면을 오래 안 본다. 지금 누를 것 하나만 남긴다.
 *
 * 왜 필요한가(실측 2026-08-12): 판매 항목이 0이어도 KPI 타일에 주황 '0'만 뜰 뿐
 * 클릭할 수 없어 **갈 곳이 없었다.** 플레이스 넛지는 `saleModes.includes('offline')`로 걸러져
 * 43업종 중 32곳(미용실·헬스장·병원·학원…)에서 아예 뜨지 않았고,
 * 플레이스가 정말 없는 업종엔 판매 항목이 **유일한 사실 소스**다
 * — 비면 그 매장 글은 영영 일반론이 된다.
 */

export type Nudge = 'place' | 'offering' | null;

export interface NudgeInput {
  /** 네이버 플레이스 연결 여부 */
  hasPlaceUrl: boolean;
  /** 판매 항목 수 — 사장님 입력분 + 크롤된 메뉴를 합친 뒤의 값 */
  offeringCount: number;
  /** 이 업종이 네이버 플레이스 페이지를 가질 만한가 — `hasPlacePage(biz)` */
  canHavePlace: boolean;
}

export function pickNudge({ hasPlaceUrl, offeringCount, canHavePlace }: NudgeInput): Nudge {
  // 플레이스가 먼저다: 한 번 붙이면 메뉴·영업시간·리뷰가 **자동으로** 따라온다(입력 0회).
  // 판매 항목은 직접 타이핑해야 하므로 같은 값을 더 비싸게 얻는 길이다.
  if (canHavePlace && !hasPlaceUrl) return 'place';

  // 플레이스를 붙였는데도 비어 있으면(가격표 탭이 없는 업종) 여기서 이어받는다.
  if (offeringCount === 0) return 'offering';

  return null;
}
