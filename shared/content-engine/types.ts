// 업종 id — business/taxonomy.ts의 BusinessType.id (문자열).
// (예전엔 'cafe'|'restaurant'|'vet' 리터럴로 좁혀 3업종밖에 못 받았음)
export type IndustryId = string;

/**
 * 이 사업이 파는 것 하나 — 메뉴(카페)·상품(소매)·시술(미용)·프로그램(예약)을 아우르는 범용 단위.
 * price/unit/note는 선택(무형 서비스는 가격이 없을 수 있음).
 */
export interface StoreOffering {
  name: string;
  price?: number;
  unit?: string; // 예: '회', '시간', '1인'
  note?: string; // 짧은 설명
}

export interface BrandTone {
  voice?: string;
  signature_moments?: string[];
  signature_menu?: string[];
  menu_narrative?: Record<string, string>;
  positioning?: string;
  target_customers?: string[];
  seo_keywords?: string[];
  avoid_expressions?: string[];
  keywords?: string[];
  /** 사장님이 직접 관리하는 판매 항목(업종 무관). 없으면 콘텐츠 엔진이 크롤된 메뉴로 폴백. */
  offerings?: StoreOffering[];
}

export interface StoreProfile {
  id: string;
  name: string;
  industryId: IndustryId;
  naverPlaceUrl?: string;
  naverBlogUrl?: string;
  address?: string;
  brandTone: BrandTone;
}

export interface PlaceInfo {
  name: string;
  address: string;
  phone?: string;
  hours?: string;
  categories: string[];
  descriptionRaw?: string;
  menu?: { name: string; price?: number }[];
  reviewHighlights?: { keyword: string; count: number }[];
  /**
   * 플레이스에 표시된 리뷰 총 개수. 우리가 크롤한 표본(최신 20건)이 아니라 **실제 총량**이라
   * 주 단위 증감을 성과로 보여줄 수 있다.
   * ⚠️ exact=false면 "1.5만" 같은 축약 표기다 — 몇백 건이 늘어도 숫자가 안 바뀌므로
   *    추이 계산에 쓰면 안 된다(늘었는데 0으로 보이거나, 반올림 경계에서 껑충 뛴다).
   */
  reviewCount?: { count: number; exact: boolean };
}

export interface DraftInput {
  store: StoreProfile;
  place?: PlaceInfo;
  photos: {
    storagePath: string;
    exif?: { takenAt?: string; lat?: number; lng?: number };
    userNote?: string;
  }[];
  targetLength?: 'short' | 'medium' | 'long';
  angle?: string;
  /**
   * 오늘의 제목 규칙(구조 로테이션). angle과 분리한 이유: angle은 기획 단계 프롬프트로만
   * 가는데 제목은 본문 단계에서 생성된다 → 제목 지시가 중간에 유실됐음(실측: question·
   * number 스타일이 통째로 무시). 본문 템플릿에 직접 주입하기 위한 전용 필드.
   */
  titleRule?: string;
}

export interface DraftOutput {
  title: string;
  bodyHtml: string;
  tags: string[];
  suggestedPhotoOrder: number[];
  qualityNotes?: string[];
}

export interface IndustryPrompt {
  systemPrompt: string;
  planningTemplate: (input: DraftInput) => string;
  writingTemplate: (planning: string, input: DraftInput) => string;
}
