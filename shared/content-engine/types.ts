// 업종 id — business/taxonomy.ts의 BusinessType.id (문자열).
// (예전엔 'cafe'|'restaurant'|'vet' 리터럴로 좁혀 3업종밖에 못 받았음)
export type IndustryId = string;

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
