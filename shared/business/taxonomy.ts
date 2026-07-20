/**
 * 사업 택소노미 — 적응(adaptation) 엔진의 심장.
 *
 * 이 도구 하나로 "어떤 자영업이든" 자기 사업에 맞는 마케팅이 돌아가야 한다.
 * (쿵더쿵=카페 인스턴스 하나일 뿐. 종목·제품·서비스가 매우 다양 → 전부 커버.)
 *
 * 사업 유형 하나가 정해지면 그로부터 앱 전체가 스스로 구성된다:
 *   업종 → (콘텐츠 프리셋) + (맞춤 채널 세트) + (마케팅 액션)
 *
 * ⚠️ 여기 없는/새 업종이 들어와도 절대 크래시 금지 — resolveBusinessType가
 *    항상 안전한 폴백(offering 기반 generic)을 돌려준다.
 */
import type { ChannelId } from '../channels/registry';

/** 대분류 — 온보딩·탐색 그룹핑용 */
export type BizGroup =
  | 'food' // 음식·외식
  | 'retail' // 소매·판매
  | 'beauty' // 뷰티·미용
  | 'health' // 건강·운동
  | 'medical' // 의료
  | 'education' // 교육
  | 'lifestyle' // 생활서비스
  | 'professional' // 전문서비스
  | 'hospitality'; // 숙박·여가

/**
 * 이 사업이 근본적으로 "무엇을 파는가" — 콘텐츠 접근을 결정.
 *   menu    = 메뉴 기반(카페·음식점): 메뉴·가격·분위기 중심
 *   product = 상품 기반(소매·온라인셀러): 상품·구매·후기 중심
 *   service = 서비스 기반(미용·수리·전문): 전문성·비포애프터·후기 중심
 *   booking = 예약 기반(병원·헬스·클래스): 신뢰·예약·성과 중심
 */
export type OfferingKind = 'menu' | 'product' | 'service' | 'booking';

/** 어떻게 파는가 — 판매(sell) 채널 추천을 결정 */
export type SaleMode =
  | 'offline' // 오프라인 매장
  | 'delivery' // 배달
  | 'online' // 온라인몰
  | 'reservation'; // 예약·방문 서비스

/** 콘텐츠 프리셋 키 — registry가 이걸로 프롬프트를 고른다(없으면 generic 폴백) */
export type ContentPreset = 'cafe' | 'restaurant' | 'vet' | 'product' | 'service' | 'booking';

export interface BusinessType {
  /** 안정 id — stores.industry_id에 저장 */
  id: string;
  /** 한글 라벨(온보딩 노출) */
  label: string;
  group: BizGroup;
  offering: OfferingKind;
  /** 기본 판매 형태(온보딩 프리필, 사용자가 조정 가능) */
  saleModes: SaleMode[];
  /** 콘텐츠 프리셋 매핑 */
  preset: ContentPreset;
  /** 콘텐츠 시드 키워드 */
  keywords: string[];
}

export const BIZ_GROUPS: Record<BizGroup, { label: string; desc: string }> = {
  food: { label: '음식·외식', desc: '카페·음식점·베이커리·주점' },
  retail: { label: '소매·판매', desc: '의류·식품·잡화·온라인셀러' },
  beauty: { label: '뷰티·미용', desc: '헤어·네일·피부·왁싱' },
  health: { label: '건강·운동', desc: '헬스·요가·필라테스·스포츠' },
  medical: { label: '의료', desc: '병원·치과·한의원·동물병원·약국' },
  education: { label: '교육', desc: '학원·과외·공방·클래스' },
  lifestyle: { label: '생활서비스', desc: '수리·청소·인테리어·펫케어' },
  professional: { label: '전문서비스', desc: '세무·법률·부동산·컨설팅' },
  hospitality: { label: '숙박·여가', desc: '펜션·스터디카페·파티룸' },
};

/**
 * 사업 유형 레지스트리. 대표적 자영업을 광범위하게 커버.
 * 새 업종 추가 = 여기 한 줄. 온보딩·채널추천·콘텐츠가 자동 반영.
 */
export const BUSINESS_TYPES: BusinessType[] = [
  // ── 음식·외식 (menu 기반) ──
  { id: 'cafe', label: '카페·디저트', group: 'food', offering: 'menu', saleModes: ['offline'], preset: 'cafe', keywords: ['원두', '분위기', '디저트', '음료'] },
  { id: 'restaurant', label: '음식점·식당', group: 'food', offering: 'menu', saleModes: ['offline', 'delivery'], preset: 'restaurant', keywords: ['메뉴', '재료', '맛집', '가성비'] },
  { id: 'bakery', label: '베이커리·제과', group: 'food', offering: 'menu', saleModes: ['offline'], preset: 'cafe', keywords: ['빵', '수제', '갓구운', '디저트'] },
  { id: 'bar', label: '주점·바·펍', group: 'food', offering: 'menu', saleModes: ['offline'], preset: 'restaurant', keywords: ['안주', '분위기', '술', '모임'] },
  { id: 'delivery_food', label: '배달 전문(치킨·분식 등)', group: 'food', offering: 'menu', saleModes: ['delivery'], preset: 'restaurant', keywords: ['배달', '메뉴', '리뷰이벤트', '포장'] },

  // ── 소매·판매 (product 기반) ──
  { id: 'fashion', label: '의류·패션·잡화', group: 'retail', offering: 'product', saleModes: ['offline', 'online'], preset: 'product', keywords: ['신상', '코디', '스타일', '착용샷'] },
  { id: 'cosmetic_retail', label: '화장품·뷰티 소매', group: 'retail', offering: 'product', saleModes: ['offline', 'online'], preset: 'product', keywords: ['신제품', '성분', '사용후기', '추천'] },
  { id: 'food_retail', label: '식품·농수산·반찬', group: 'retail', offering: 'product', saleModes: ['offline', 'online', 'delivery'], preset: 'product', keywords: ['신선', '산지직송', '수제', '건강'] },
  { id: 'living_goods', label: '생활용품·소품샵', group: 'retail', offering: 'product', saleModes: ['offline', 'online'], preset: 'product', keywords: ['신상', '실용', '선물', '인테리어'] },
  { id: 'flower_gift', label: '플라워·기프트', group: 'retail', offering: 'product', saleModes: ['offline', 'online'], preset: 'product', keywords: ['꽃다발', '기념일', '선물', '주문제작'] },
  { id: 'online_seller', label: '온라인 셀러(스마트스토어 등)', group: 'retail', offering: 'product', saleModes: ['online'], preset: 'product', keywords: ['신상', '리뷰', '베스트', '할인'] },

  // ── 뷰티·미용 (service/booking) ──
  { id: 'hair', label: '미용실·헤어', group: 'beauty', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['헤어스타일', '펌', '염색', '비포애프터'] },
  { id: 'nail', label: '네일·속눈썹', group: 'beauty', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['네일아트', '디자인', '시술', '트렌드'] },
  { id: 'skincare', label: '피부·왁싱·태닝', group: 'beauty', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['관리', '피부', '케어', '효과'] },
  { id: 'makeup', label: '메이크업·뷰티샵', group: 'beauty', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['메이크업', '스타일링', '뷰티', '비포애프터'] },

  // ── 건강·운동 (booking) ──
  { id: 'gym', label: '헬스장·PT', group: 'health', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['운동', '체형', 'PT', '변화'] },
  { id: 'yoga_pilates', label: '요가·필라테스', group: 'health', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['자세', '수업', '체형교정', '힐링'] },
  { id: 'golf_screen', label: '골프·스크린', group: 'health', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['레슨', '스윙', '실내', '연습'] },
  { id: 'sports_facility', label: '스포츠·체육시설', group: 'health', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['수업', '대관', '강습', '시설'] },

  // ── 의료 (booking, 신뢰 중심) ──
  { id: 'clinic', label: '병원·의원', group: 'medical', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['진료', '치료', '전문', '건강'] },
  { id: 'dental', label: '치과', group: 'medical', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['치료', '교정', '임플란트', '검진'] },
  { id: 'oriental', label: '한의원', group: 'medical', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['한방', '치료', '체질', '건강'] },
  { id: 'vet', label: '동물병원', group: 'medical', offering: 'booking', saleModes: ['reservation'], preset: 'vet', keywords: ['진료', '케어', '반려동물', '건강'] },
  { id: 'pharmacy', label: '약국', group: 'medical', offering: 'service', saleModes: ['offline'], preset: 'service', keywords: ['건강', '상담', '영양제', '복약'] },

  // ── 교육 (booking/service) ──
  { id: 'academy', label: '학원·교습소', group: 'education', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['수업', '성적', '커리큘럼', '상담'] },
  { id: 'tutoring', label: '과외·공부방', group: 'education', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['맞춤', '수업', '성적', '관리'] },
  { id: 'class_studio', label: '공방·원데이클래스', group: 'education', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['클래스', '체험', '만들기', '취미'] },
  { id: 'music_art', label: '음악·미술 학원', group: 'education', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['레슨', '실력', '입시', '취미'] },

  // ── 생활서비스 (service) ──
  { id: 'repair', label: '수리·설치', group: 'lifestyle', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['수리', '출장', '전문', '신속'] },
  { id: 'cleaning', label: '청소·방역', group: 'lifestyle', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['청소', '입주', '방역', '깔끔'] },
  { id: 'interior', label: '인테리어·시공', group: 'lifestyle', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['시공', '디자인', '리모델링', '비포애프터'] },
  { id: 'moving', label: '이사·운송', group: 'lifestyle', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['이사', '포장', '견적', '안전'] },
  { id: 'pet_care', label: '애견미용·펫케어', group: 'lifestyle', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['미용', '반려동물', '케어', '비포애프터'] },
  { id: 'laundry', label: '세탁·코인빨래', group: 'lifestyle', offering: 'service', saleModes: ['offline'], preset: 'service', keywords: ['세탁', '전문', '편리', '깔끔'] },

  // ── 전문서비스 (service, 전문성 중심) ──
  { id: 'accounting', label: '세무·회계', group: 'professional', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['절세', '기장', '상담', '전문'] },
  { id: 'legal', label: '법률·행정사', group: 'professional', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['상담', '해결', '전문', '신뢰'] },
  { id: 'realestate', label: '부동산·공인중개', group: 'professional', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['매물', '시세', '상담', '지역'] },
  { id: 'consulting', label: '컨설팅·마케팅', group: 'professional', offering: 'service', saleModes: ['reservation'], preset: 'service', keywords: ['성과', '전략', '상담', '전문'] },
  { id: 'freelancer', label: '디자인·개발 프리랜서', group: 'professional', offering: 'service', saleModes: ['online', 'reservation'], preset: 'service', keywords: ['포트폴리오', '제작', '의뢰', '전문'] },

  // ── 숙박·여가 (booking) ──
  { id: 'pension', label: '펜션·게스트하우스', group: 'hospitality', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['객실', '전망', '예약', '휴식'] },
  { id: 'studycafe', label: '스터디카페·독서실', group: 'hospitality', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['좌석', '집중', '이용권', '환경'] },
  { id: 'party_room', label: '파티룸·모임공간', group: 'hospitality', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['대관', '모임', '파티', '공간'] },
  { id: 'leisure', label: '여가·체험시설', group: 'hospitality', offering: 'booking', saleModes: ['reservation'], preset: 'booking', keywords: ['체험', '예약', '즐길거리', '이용'] },
];

const BY_ID = new Map(BUSINESS_TYPES.map((b) => [b.id, b]));

/** 안전 조회 — 없는 id면 undefined (크래시 금지) */
export function getBusinessType(id?: string | null): BusinessType | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

/**
 * 항상 유효한 BusinessType를 돌려주는 해석기.
 * 알 수 없는/레거시 id도 offering을 유추해 안전 폴백(default: 서비스형 generic).
 * 콘텐츠 엔진·채널추천이 절대 throw하지 않도록 이걸 쓴다.
 */
export function resolveBusinessType(id?: string | null): BusinessType {
  return (
    getBusinessType(id) ?? {
      id: id || 'generic',
      label: '일반 매장',
      group: 'lifestyle',
      offering: 'service',
      saleModes: ['offline'],
      preset: 'service',
      keywords: [],
    }
  );
}

export function businessTypesByGroup(group: BizGroup): BusinessType[] {
  return BUSINESS_TYPES.filter((b) => b.group === group);
}

/**
 * 이 사업에 맞는 추천 채널 세트를 유도.
 * 업종을 하드코딩하지 않고 offering·saleModes·group에서 파생 → 새 업종도 자동 대응.
 * 반환 순서 = 추천 우선순위(온보딩·채널센터가 이 순서로 정렬/프리필).
 */
export function recommendedChannelsFor(biz: BusinessType): ChannelId[] {
  const set = new Set<ChannelId>();
  const add = (...ids: ChannelId[]) => ids.forEach((i) => set.add(i));

  // 1) 공통 유입 baseline — 어떤 자영업이든 지역 검색·콘텐츠는 기본
  add('naver_place', 'naver_blog', 'instagram');

  // 2) 판매 형태별 sell 채널
  if (biz.saleModes.includes('delivery')) add('baemin', 'yogiyo');
  if (biz.saleModes.includes('online')) add('smartstore', 'coupang');

  // 3) offering별 성향
  if (biz.offering === 'product') add('smartstore'); // 상품은 판매 채널이 곧 유입
  if (biz.offering === 'booking' || biz.offering === 'service') add('google_business'); // 예약·서비스는 지도/검색 노출 중요

  // 4) 공통 재방문 — 단골 재방문 유도는 전 업종 핵심
  add('kakao_alimtalk');

  return [...set];
}

/** 사업 유형 → 마케팅 액션 성향(대시보드/온보딩 카피 개인화용) */
export function marketingFocusFor(biz: BusinessType): string {
  switch (biz.offering) {
    case 'menu':
      return '메뉴·분위기를 알리고 단골을 만드는';
    case 'product':
      return '상품을 노출하고 구매로 잇는';
    case 'service':
      return '전문성과 후기로 신뢰를 쌓는';
    case 'booking':
      return '예약을 늘리고 재방문을 만드는';
  }
}
