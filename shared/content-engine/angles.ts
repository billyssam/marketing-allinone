import type { OfferingKind } from '../business/taxonomy';
import { seasonalContext } from './seasonal';

/**
 * 콘텐츠 각도(angle) 로테이션 — 데일리 자동 콘텐츠가 매일 비슷해지는 걸 막는다.
 * 매일 같은 매장에서 같은 톤의 글이 나오면 사장님이 질려서 이탈(자동 콘텐츠 최대 리스크).
 * 업종(offering)별 각도 세트를 날짜별로 돌려 "오늘은 대표 메뉴, 내일은 분위기…" 식으로 변주.
 *
 * DraftInput.angle 에 directive를 넣으면 planning 프롬프트의 "방향"으로 들어간다(이미 배선됨).
 */
export interface ContentAngle {
  key: string;
  label: string;
  /** 프롬프트에 들어갈 방향 지시문 */
  directive: string;
}

const ANGLES: Record<OfferingKind, ContentAngle[]> = {
  // 메뉴 기반(카페·음식점·베이커리)
  menu: [
    { key: 'signature', label: '대표 메뉴', directive: '대표 메뉴 한 가지를 골라 재료·맛·즐기는 법을 깊이 있게 소개. 읽으면 맛이 상상되게.' },
    { key: 'season', label: '계절·시의성', directive: '요즘 계절·날씨에 어울리는 메뉴나 순간을 중심으로. 바로 지금 오고 싶게.' },
    { key: 'space', label: '분위기·공간', directive: '매장의 분위기·공간·자리를 중심으로. 여기서 어떤 시간을 보낼 수 있는지.' },
    { key: 'behind', label: '정성·비하인드', directive: '사장님의 정성·준비 과정·철학을 진솔하게. 왜 이렇게까지 하는지.' },
    { key: 'pairing', label: '추천 조합·팁', directive: '메뉴 조합 추천이나 방문 팁(시간대·자리·주문법)을 실용적으로.' },
  ],
  // 상품 기반(소매·온라인셀러)
  product: [
    { key: 'spotlight', label: '상품 스포트라이트', directive: '상품 하나를 골라 특징·차별점·품질을 구체적으로 소개. 왜 좋은지 손에 잡히게.' },
    { key: 'usage', label: '활용·스타일링', directive: '상품을 실제로 어떻게 쓰는지·어울리는지 장면 중심으로. 구매 후 모습이 그려지게.' },
    { key: 'who', label: '이런 분께', directive: '어떤 고민·상황·사람에게 딱 맞는 상품인지 타겟을 좁혀 제안.' },
    { key: 'season', label: '시즌·선물', directive: '요즘 시즌·기념일에 어울리는 상품이나 선물 아이디어 중심으로.' },
    { key: 'review', label: '후기·신뢰', directive: '실제 사용감·후기 톤으로 신뢰를 주는 방향. 과장 없이 담백하게.' },
  ],
  // 서비스 기반(미용·수리·전문서비스)
  service: [
    { key: 'result', label: '비포·애프터', directive: '실제 결과·변화(비포애프터 톤)를 중심으로. 맡기면 이렇게 된다는 그림.' },
    { key: 'expertise', label: '전문성·노하우', directive: '이 서비스만의 전문성·기술·과정을 근거로. 왜 믿고 맡겨도 되는지.' },
    { key: 'problem', label: '고민 해결', directive: '고객이 흔히 겪는 고민 하나를 짚고, 어떻게 해결하는지 중심으로.' },
    { key: 'menu', label: '서비스 소개', directive: '대표 서비스·시술 하나를 골라 무엇을·어떻게·얼마나를 명확히 소개.' },
    { key: 'tip', label: '관리·꿀팁', directive: '고객이 알아두면 좋은 관리 팁·정보를 주는 방향. 전문가의 조언 톤.' },
  ],
  // 예약 기반(병원·헬스·클래스·숙박)
  booking: [
    { key: 'result', label: '성과·변화', directive: '실제 성과·변화·후기를 중심으로. 여기 오면 뭐가 달라지는지.' },
    { key: 'program', label: '프로그램 소개', directive: '대표 프로그램·서비스 하나를 골라 구성·효과·대상을 명확히 소개.' },
    { key: 'firstvisit', label: '첫 방문 안내', directive: '처음 오는 사람을 위한 안내(예약법·첫날·준비물). 문턱을 낮추는 방향.' },
    { key: 'trust', label: '전문성·시설', directive: '전문성·자격·시설을 근거로 안심을 주는 방향.' },
    { key: 'faq', label: '자주 묻는 질문', directive: '고객이 자주 궁금해하는 것 하나를 골라 친절히 답하는 방향.' },
  ],
};

/** FNV-1a 해시 — 매장별 안정 시드(같은 매장은 늘 같은 시작점) */
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 오늘의 각도 선택 — (매장 시드 + 날짜)로 결정적.
 * dayNumber가 매일 +1 → 연속된 날은 항상 다른 각도(리스트 길이 1 아닌 한).
 * 매장마다 시드가 달라 같은 날도 매장별로 다른 각도.
 */
export function angleFor(offering: OfferingKind, storeId: string, dayNumber: number): ContentAngle {
  const list = ANGLES[offering];
  const idx = (((dayNumber + seedOf(storeId)) % list.length) + list.length) % list.length;
  return list[idx];
}

/** KST 기준 일련 날짜 번호(로테이션용) */
export function kstDayNumber(nowMs: number): number {
  return Math.floor((nowMs + 9 * 3600_000) / 86_400_000);
}

/** 업종 offering의 전체 각도(컴포저 수동 선택용) */
export function anglesForOffering(offering: OfferingKind): ContentAngle[] {
  return ANGLES[offering];
}

/**
 * 오늘의 콘텐츠 방향 = 각도 로테이션 + 시점(계절·시의성) 결합.
 * 데일리 크론·수동 생성(각도 미지정 시) 공용 → 언제 만들어도 신선하고 시의성 있게.
 */
export function dailyDirective(
  offering: OfferingKind,
  storeId: string,
  nowMs: number,
): { directive: string; angle: ContentAngle } {
  const angle = angleFor(offering, storeId, kstDayNumber(nowMs));
  const season = seasonalContext(nowMs);
  return { directive: `${angle.directive} ${season.hint}`, angle };
}
