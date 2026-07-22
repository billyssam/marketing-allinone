import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { BASE_SYSTEM_PROMPT } from './prompts/base';
import { getIndustryPrompt } from './registry';
import { resolveOfferings, offeringLabel, formatOffering } from './offerings';
import { resolveBusinessType } from '../business/taxonomy';
import type { DraftInput, DraftOutput } from './types';

const draftOutputSchema = z.object({
  title: z.string().min(1).max(120),
  bodyHtml: z.string().min(50),
  tags: z.array(z.string()).min(3).max(15),
  suggestedPhotoOrder: z.array(z.number().int().min(0)),
  qualityNotes: z.array(z.string()).optional(),
});

export interface GeminiClientConfig {
  apiKey?: string;
  planningModel?: string;
  writingModel?: string;
  temperature?: number;
}

export interface GeminiClient {
  generate(input: DraftInput): Promise<DraftOutput>;
  planOnly(input: DraftInput): Promise<string>;
}

export function createGeminiClient(config: GeminiClientConfig = {}): GeminiClient {
  const apiKey =
    config.apiKey ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Gemini API key가 설정돼 있지 않습니다. https://aistudio.google.com/apikey 에서 발급 후 .env.local에 GOOGLE_GENERATIVE_AI_API_KEY=... 추가하세요.',
    );
  }
  // 키 형식 검증은 하지 않는다 — Google이 새로 도입한 AQ. 프리픽스 등도 유효하기 때문.

  const genAI = new GoogleGenerativeAI(apiKey);
  // 기본: 두 단계 모두 Flash (무료 티어 유지). Pro는 결제 활성화 시 수동 지정.
  const planningModelName = config.planningModel ?? 'gemini-2.5-flash';
  const writingModelName = config.writingModel ?? 'gemini-2.5-flash';
  const temperature = config.temperature ?? 0.75;

  // 무료 flash 일일한도(실측: 프로젝트당 20/일) 소진 시 flash-lite로 폴백.
  // 모델별 쿼터 버킷이 분리라 lite(한도 훨씬 큼)가 살아있음 → 품질 우선 + 용량 확보.
  const FALLBACK_MODEL = 'gemini-2.5-flash-lite';
  const isRateLimited = (e: unknown) => /429|quota|rate/i.test(e instanceof Error ? e.message : String(e));
  async function callWithFallback(
    modelName: string,
    systemInstruction: string,
    generationConfig: Record<string, unknown>,
    prompt: string,
  ): Promise<string> {
    try {
      const m = genAI.getGenerativeModel({ model: modelName, systemInstruction, generationConfig });
      return (await m.generateContent(prompt)).response.text();
    } catch (e) {
      if (!isRateLimited(e) || modelName === FALLBACK_MODEL) throw e;
      console.warn(`[gemini] ${modelName} 한도 → ${FALLBACK_MODEL} 폴백`);
      const m = genAI.getGenerativeModel({ model: FALLBACK_MODEL, systemInstruction, generationConfig });
      return (await m.generateContent(prompt)).response.text();
    }
  }

  return {
    async planOnly(input) {
      const industry = getIndustryPrompt(input.store.industryId);
      const systemInstruction = `${BASE_SYSTEM_PROMPT}\n\n${industry.systemPrompt}\n\n${brandToneSection(input)}\n\n${placeFactSection(input)}`;
      return callWithFallback(planningModelName, systemInstruction, { temperature }, industry.planningTemplate(input));
    },

    async generate(input) {
      const industry = getIndustryPrompt(input.store.industryId);
      const systemInstruction = `${BASE_SYSTEM_PROMPT}\n\n${industry.systemPrompt}\n\n${brandToneSection(input)}\n\n${placeFactSection(input)}`;

      // 1단계: 기획
      const plan = await callWithFallback(
        planningModelName, systemInstruction, { temperature }, industry.planningTemplate(input),
      );

      // 2단계: 본문 (JSON 강제)
      const raw = await callWithFallback(
        writingModelName, systemInstruction,
        { temperature, responseMimeType: 'application/json' },
        industry.writingTemplate(plan, input),
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // 간헐적 출력 절단(특히 flash-lite) → 본문 1회 재생성으로 흡수
        console.warn('[gemini] JSON 절단/파싱 실패 → 본문 재생성 1회');
        const retry = await callWithFallback(
          writingModelName, systemInstruction,
          { temperature, responseMimeType: 'application/json' },
          industry.writingTemplate(plan, input),
        );
        try {
          parsed = JSON.parse(retry);
        } catch (err2) {
          throw new Error(
            `Gemini 응답 JSON 파싱 실패(재시도 포함): ${(err2 as Error).message}\n원문 앞 300자:\n${retry.slice(0, 300)}`,
          );
        }
      }

      return draftOutputSchema.parse(parsed);
    },
  };
}

function brandToneSection(input: DraftInput): string {
  const t = input.store.brandTone ?? {};
  const lines = [
    `## 이 매장 고유 톤·자산 (매우 중요)`,
    t.voice ? `- 톤: ${t.voice}` : null,
    t.positioning ? `- 포지셔닝: ${t.positioning}` : null,
    t.signature_menu?.length ? `- 시그니처 메뉴: ${t.signature_menu.join(', ')}` : null,
    t.signature_moments?.length
      ? `- 시그니처 순간(반드시 언급 검토): \n  - ${t.signature_moments.join('\n  - ')}`
      : null,
    t.target_customers?.length ? `- 주요 타깃: ${t.target_customers.join(', ')}` : null,
    t.seo_keywords?.length ? `- SEO 키워드 후보: ${t.seo_keywords.join(', ')}` : null,
    t.avoid_expressions?.length ? `- 금지 표현: ${t.avoid_expressions.join(', ')}` : null,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '(매장 고유 톤 정보 없음)';
}

/**
 * 매장 실제 사실(주소/전화/영업시간/메뉴)을 프롬프트에 명시.
 * ⚠️ Gemini가 이 값을 지어내지 못하게 강력히 명령한다.
 * 배포 서비스에서 잘못된 정보 노출은 사장님 신뢰도 붕괴 → 절대 금지.
 */
function placeFactSection(input: DraftInput): string {
  const p = input.place;
  const store = input.store;
  const facts: string[] = [];
  facts.push(`## 매장 실제 사실 (⚠️ 아래 값을 절대 지어내지 말 것. 정확히 이 값만 사용.)`);
  facts.push(`- 정확한 상호: ${store.name}`);
  const address = p?.address || store.address;
  if (address) facts.push(`- 정확한 주소: ${address}`);
  if (p?.phone) facts.push(`- 정확한 전화번호: ${p.phone}`);
  if (p?.hours) facts.push(`- 정확한 영업시간: ${p.hours}`);
  if (p?.descriptionRaw) facts.push(`- 찾아가는길: ${p.descriptionRaw}`);
  // 판매 항목 — 업종 무관(메뉴/상품/시술/프로그램). 사장님 관리분 우선, 없으면 크롤 메뉴.
  const offerings = resolveOfferings(store.brandTone, p);
  if (offerings.length) {
    const kind = resolveBusinessType(store.industryId).offering;
    facts.push(`- ${offeringLabel(kind)}:`);
    for (const o of offerings) facts.push(`  · ${formatOffering(o)}`);
  }
  facts.push('');
  facts.push(`## 절대 규칙`);
  facts.push(
    `1. **주소·영업시간·전화번호·판매 항목 가격은 위 값을 정확히 사용**. 절대 지어내거나 어림잡지 말 것.`,
  );
  facts.push(
    `2. 위 값이 비어 있으면 그 항목은 **본문에서 아예 언급하지 않음**. "확인 필요" 같은 자리표시자 금지.`,
  );
  facts.push(
    `3. 본문 마지막 "찾아오시는 길" 문단에는 위 정확한 주소·영업시간·전화번호를 **원문 그대로** 삽입.`,
  );
  facts.push(
    `4. 판매 항목(메뉴·상품·시술 등)은 위 목록에 없는 것을 지어내지 말 것. 있는 것만 활용.`,
  );
  if (!address) {
    facts.push(
      `5. **주소가 없으므로 오프라인 공간 묘사 절대 금지** — "골목길에 자리한", "매장에 들어서면", 인테리어·향기·방문 장면 등을 지어내지 말 것(온라인 판매자일 수 있음). 경험담은 상품·서비스 자체의 사용 경험으로만 쓸 것.`,
    );
  }
  return facts.join('\n');
}
