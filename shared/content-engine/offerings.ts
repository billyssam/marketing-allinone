import type { BrandTone, StoreOffering, PlaceInfo } from './types';
import type { OfferingKind } from '../business/taxonomy';

/**
 * "이 사업이 파는 것"을 업종 무관하게 해석.
 * 우선순위: 사장님이 직접 관리한 offerings > 크롤된 플레이스 메뉴(카페 등).
 * → 카페는 크롤로 자동, 소매·서비스·예약업은 사장님 입력으로 실제 소재를 갖는다.
 */
export function resolveOfferings(
  brandTone: BrandTone | Record<string, unknown> | null | undefined,
  place?: PlaceInfo | null,
): StoreOffering[] {
  const owned = (brandTone as BrandTone | undefined)?.offerings;
  if (Array.isArray(owned) && owned.length) {
    return owned.filter((o) => o && typeof o.name === 'string' && o.name.trim());
  }
  const menu = place?.menu;
  if (Array.isArray(menu) && menu.length) {
    return menu.map((m) => ({ name: m.name, price: m.price }));
  }
  return [];
}

/** offering 종류별 프롬프트 라벨 — 메뉴/상품/시술/프로그램 */
export function offeringLabel(kind: OfferingKind): string {
  switch (kind) {
    case 'menu':
      return '실제 메뉴·가격';
    case 'product':
      return '실제 상품·가격';
    case 'service':
      return '실제 서비스·시술';
    case 'booking':
      return '실제 프로그램·서비스';
  }
}

/** 한 줄 표기: "· 이름 (1,000원/회) — 설명" (있는 값만) */
export function formatOffering(o: StoreOffering): string {
  const price = typeof o.price === 'number' ? ` (${o.price.toLocaleString()}원${o.unit ? `/${o.unit}` : ''})` : '';
  const note = o.note ? ` — ${o.note}` : '';
  return `${o.name}${price}${note}`;
}
