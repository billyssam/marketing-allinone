import { cafePrompt } from './prompts/cafe';
import { restaurantPrompt } from './prompts/restaurant';
import { vetPrompt } from './prompts/vet';
import { productPrompt, servicePrompt, bookingPrompt } from './prompts/generic';
import { resolveBusinessType, type ContentPreset } from '../business/taxonomy';
import type { IndustryPrompt } from './types';

/** 콘텐츠 프리셋 키 → 실제 프롬프트 */
const PROMPTS: Record<ContentPreset, IndustryPrompt> = {
  cafe: cafePrompt,
  restaurant: restaurantPrompt,
  vet: vetPrompt,
  product: productPrompt,
  service: servicePrompt,
  booking: bookingPrompt,
};

/**
 * 업종 id → 프롬프트. taxonomy를 거쳐 프리셋을 고른다.
 * ⚠️ 알 수 없는 업종도 resolveBusinessType가 안전 폴백(service)을 주므로 절대 throw 안 함.
 * (예전엔 cafe/restaurant/vet 외 업종에서 throw → 미용실 사장 가입 시 콘텐츠 생성 크래시)
 */
export function getIndustryPrompt(id: string): IndustryPrompt {
  const preset = resolveBusinessType(id).preset;
  return PROMPTS[preset] ?? servicePrompt;
}

/** 콘텐츠 프리셋이 존재하는 프리셋 키 목록 */
export const AVAILABLE_PRESETS: ContentPreset[] = ['cafe', 'restaurant', 'vet', 'product', 'service', 'booking'];
