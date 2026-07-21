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
