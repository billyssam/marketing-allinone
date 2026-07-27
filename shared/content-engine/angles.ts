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

export type TargetLength = 'short' | 'medium' | 'long';
// 심층 소개·스토리형 각도는 길게, 빠른 팁·짧은 답형은 짧게, 나머지 보통.
const LONG_ANGLES = new Set(['signature', 'behind', 'spotlight', 'result', 'expertise', 'program']);
const SHORT_ANGLES = new Set(['pairing', 'who', 'tip', 'faq']);

/** 각도 성격에 맞는 글 길이 — 내용 유형별 자연스러운 포맷 변주 */
export function lengthForAngle(key: string): TargetLength {
  if (LONG_ANGLES.has(key)) return 'long';
  if (SHORT_ANGLES.has(key)) return 'short';
  return 'medium';
}

/**
 * 제목 구조 로테이션 — 프롬프트로 "매번 다른 구조"를 부탁해도 모델은 '지역+상호,'
 * 시작으로 관성 수렴한다(실측: 8일 연속 "옥천 안내면 쿵더쿵, ~" + '쉼표' 4회 반복).
 * 각도처럼 구조 자체를 결정적으로 순환시켜 반복을 원천 차단한다.
 * 길이 6(각도 5와 서로소)이라 각도×제목구조 조합이 30일 주기로 돈다.
 */
export interface TitleStyle {
  key: string;
  rule: string;
  /** few-shot 예시 — 형식이 뚜렷한 스타일(질문·숫자)일수록 규칙 문장만으론 무시된다(실측) */
  example: string;
  /** 산출물이 이 스타일을 지켰는지 판정(검증·회귀 테스트용) */
  check?: (title: string) => boolean;
}

const TITLE_STYLES: TitleStyle[] = [
  {
    key: 'question',
    rule: '질문형 제목 — 반드시 물음표(?)로 끝낼 것. 상호는 문장 중간이나 뒤에.',
    example: '무더위에 지칠 땐 어디로 가야 할까요? 옥천 쿵더쿵의 여름 한 잔',
    check: (t) => t.includes('?'),
  },
  {
    key: 'sensory',
    rule: '감각·장면 묘사로 시작하는 제목(소리·향·온도·풍경). 상호명으로 시작하지 말 것.',
    example: '버터 향이 번지는 오후, 옥천 쿵더쿵에서 만난 크로플',
  },
  {
    key: 'number',
    rule: '숫자가 반드시 들어간 제목(가짓수·시간·인원 등). 상호는 뒤쪽에.',
    example: '단 5분이면 충분한 휴식, 옥천 쿵더쿵의 세 가지 여름 메뉴',
    // '커피 한 잔' 같은 관용 단수는 숫자 제목이 아니다 → 아라비아 숫자 또는 2 이상 수사만 인정
    check: (t) => /[0-9]/.test(t) || /(두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(가지|분|잔|시간|명|개|번)/.test(t),
  },
  {
    key: 'situation',
    rule: '고객의 상황·고민으로 시작하는 제목. 지역·상호는 문장 뒤에 자연스럽게.',
    example: '퇴근길이 유난히 길게 느껴진 날, 옥천 쿵더쿵에 들렀습니다',
  },
  {
    key: 'plain',
    rule: '상호를 앞에 두어도 되는 제목. 단 뒤 문구는 최근 제목과 완전히 다른 어휘로.',
    example: '쿵더쿵 카페의 여름 신메뉴, 눈꽃빙수가 나왔습니다',
  },
  {
    key: 'topic',
    rule: '오늘의 중심 소재(메뉴·상품 등)를 제목 맨 앞에 세울 것. 상호는 뒤에 가볍게.',
    example: '수제대추차 한 잔에 담긴 정성, 옥천 쿵더쿵',
  },
];

/** 오늘의 제목 구조 — 각도와 독립 오프셋으로 결정적 순환 */
export function titleStyleFor(storeId: string, dayNumber: number): TitleStyle {
  const idx = (((dayNumber + seedOf(storeId) + 3) % TITLE_STYLES.length) + TITLE_STYLES.length) % TITLE_STYLES.length;
  return TITLE_STYLES[idx];
}

/**
 * 본문 단계 프롬프트에 직접 넣을 제목 지시 — 규칙 + 예시 + 금지 패턴을 한 덩어리로.
 * (angle에만 담으면 기획 단계에서 소실됨 — 실측으로 확인된 유실 경로)
 */
export function titleDirective(style: TitleStyle, storeName: string, banned: string[] = []): string {
  return (
    `제목 규칙(반드시 지킬 것): ${style.rule}\n` +
    `  · 형식 예시(내용은 따라 쓰지 말고 구조만 참고): "${style.example}"\n` +
    `  · 🚫 금지: 제목을 "${storeName}"(으)로 시작하거나 "지역명 ${storeName}, ~" 형태로 쓰는 것` +
    (style.key === 'plain' ? ' — 단 이번 글은 상호로 시작해도 됨.' : '.') +
    (banned.length ? `\n  · 🚫 이 단어들은 제목에 쓰지 말 것: ${banned.join(', ')}` : '')
  );
}

/**
 * 최근 제목들에서 2회 이상 반복된 시어 추출 — "이 단어 금지"로 명시해야 모델이 멈춘다.
 * (실측: '쉼표' 4회·'따뜻한' 6회 — "겹치지 않게"라는 소극 지시로는 못 막았음)
 * allow(상호·지역명 등 SEO상 반복이 정상인 단어)는 제외.
 */
export function repeatedTitleWords(titles: string[], allow: string[] = []): string[] {
  const tokenize = (s: string) => s.split(/[^가-힣a-zA-Z0-9]+/).filter((w) => w.length >= 2);
  const allowTokens = allow.flatMap(tokenize);
  // 접두 매칭: 주소는 "옥천군"인데 제목은 "옥천"처럼 조사·접미가 갈리므로 정확일치로는 못 거름
  const isAllowed = (w: string) => allowTokens.some((a) => a.startsWith(w) || w.startsWith(a));
  const count = new Map<string, number>();
  for (const t of titles) {
    const seen = new Set<string>();
    for (const w of tokenize(t)) {
      if (isAllowed(w) || seen.has(w)) continue; // 같은 제목 안 중복은 1회로
      seen.add(w);
      count.set(w, (count.get(w) ?? 0) + 1);
    }
  }
  return [...count.entries()].filter(([, c]) => c >= 2).map(([w]) => w);
}

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

export interface PlannedDay {
  dayOffset: number; // 0=오늘
  angleLabel: string;
  featured?: string;
  occasion?: string;
}

/**
 * 앞으로 N일 콘텐츠 계획(각도·중심소재·이벤트) 미리보기.
 * 로테이션이 결정적이라 미래 계획을 정확히 보여줄 수 있다 → 사장님에게 "다양한 글이
 * 예정돼 있다"는 투명성 제공. (dashboard '이번 주 콘텐츠 계획')
 */
export function weekPlan(
  offering: OfferingKind,
  storeId: string,
  offeringNames: string[],
  fromMs: number,
  days = 7,
): PlannedDay[] {
  const out: PlannedDay[] = [];
  for (let i = 0; i < days; i++) {
    const ms = fromMs + i * 86_400_000;
    const d = dailyDirective(offering, storeId, ms, offeringNames);
    out.push({ dayOffset: i, angleLabel: d.angle.label, featured: d.featured, occasion: seasonalContext(ms).occasion });
  }
  return out;
}

/**
 * 오늘의 콘텐츠 방향 = 각도 로테이션 + 시점(계절·시의성) + 중심 소재 로테이션.
 * 데일리 크론·수동 생성(각도 미지정 시) 공용 → 언제 만들어도 신선하고 시의성 있게.
 *
 * offeringNames를 주면 매일 다른 항목을 중심 소재로 제안 → 소재까지 변주(같은 메뉴 반복 방지).
 * (각도 시드와 오프셋을 달리해 각도·소재가 독립적으로 돌게)
 */
export function dailyDirective(
  offering: OfferingKind,
  storeId: string,
  nowMs: number,
  offeringNames: string[] = [],
): { directive: string; angle: ContentAngle; featured?: string; length: TargetLength; titleStyle: TitleStyle } {
  const day = kstDayNumber(nowMs);
  const angle = angleFor(offering, storeId, day);
  const season = seasonalContext(nowMs);
  const titleStyle = titleStyleFor(storeId, day);

  let featured: string | undefined;
  const names = offeringNames.filter((n) => n && n.trim());
  if (names.length) {
    featured = names[(((day + 7) % names.length) + names.length) % names.length];
  }
  const featuredHint = featured ? ` 오늘은 특히 '${featured}'을(를) 본문에서 중심 소재로 자연스럽게 다뤄주세요(제목엔 억지로 넣지 말 것, 없는 내용 지어내기 X).` : '';

  // 각도를 "글의 중심 콘셉트"로 강하게 프레이밍 — 안 그러면 AI가 각도를 무시하고
  // 메뉴/상품 백과사전식 나열로 흐름(실측 확인). 각도가 글 구조를 이끌게 한다.
  const directive =
    `★ 이번 글의 중심 콘셉트(글 전체를 반드시 이 방향으로 이끌 것): ${angle.directive}` +
    ` ${season.hint}${featuredHint}` +
    ` 판매 항목을 백과사전처럼 전부 나열하지 말고, 위 콘셉트와 중심 소재를 깊이 있게 풀어낼 것(다른 항목은 필요할 때만 가볍게).`;
  // 제목 지시는 directive에 넣지 않는다 — angle은 기획 단계 전용이라 본문 단계에서 유실된다.
  // 호출부가 titleStyle을 titleDirective()로 만들어 DraftInput.titleRule에 직접 주입할 것.

  return { directive, angle, featured, length: lengthForAngle(angle.key), titleStyle };
}
