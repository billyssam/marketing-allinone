import type { BrandTone, PlaceInfo } from './types';

/**
 * stores.brand_tone.place_facts(크롤 저장분) → DraftInput.place 변환.
 * placeFactSection이 이 값을 프롬프트에 박아 메뉴·가격·영업시간을 지어내지 않는 글을 만든다.
 * (crawl-place.ts가 저장, 여기는 순수 변환 — playwright 의존 없음이라 web에서도 안전)
 */
export function placeFromBrandTone(tone: BrandTone | Record<string, unknown> | null | undefined): PlaceInfo | undefined {
  const pf = (tone as Record<string, unknown> | null | undefined)?.place_facts as
    | {
        name?: string;
        address?: string;
        phone?: string | null;
        hours?: string | null;
        categories?: string[];
        descriptionRaw?: string | null;
        menu?: { name: string; price?: number }[];
      }
    | undefined;
  if (!pf || !pf.name) return undefined;
  return {
    name: pf.name,
    address: pf.address ?? '',
    phone: pf.phone ?? undefined,
    hours: pf.hours ?? undefined,
    categories: pf.categories ?? [],
    descriptionRaw: pf.descriptionRaw ?? undefined,
    menu: pf.menu ?? [],
  };
}
