import { cafePrompt } from './prompts/cafe';
import { restaurantPrompt } from './prompts/restaurant';
import { vetPrompt } from './prompts/vet';
import type { IndustryId, IndustryPrompt } from './types';

const PROMPTS: Record<IndustryId, IndustryPrompt> = {
  cafe: cafePrompt,
  restaurant: restaurantPrompt,
  vet: vetPrompt,
};

export function getIndustryPrompt(id: IndustryId): IndustryPrompt {
  const p = PROMPTS[id];
  if (!p) throw new Error(`알 수 없는 업종 ID: ${id}`);
  return p;
}

export const AVAILABLE_INDUSTRIES: IndustryId[] = ['cafe', 'restaurant', 'vet'];
