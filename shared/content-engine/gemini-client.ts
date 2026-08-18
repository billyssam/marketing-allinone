import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { BASE_SYSTEM_PROMPT } from './prompts/base';
import { getIndustryPrompt } from './registry';
import { resolveOfferings, offeringLabel, formatOffering } from './offerings';
import { dropFabricatedRegionTags } from './place-facts';
import { resolveBusinessType } from '../business/taxonomy';
import type { DraftInput, DraftOutput } from './types';

/** 태그를 배열로 정규화 — 모델이 "a, b, c" 문자열로 줄 때가 있다 */
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).replace(/^#/, '').trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(/[,#\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * 부가 필드(tags·사진 순서)는 **형태가 틀려도 글을 버리지 않는다.**
 *
 * 실측(2026-08-16 무인 크론): 모델이 tags를 배열이 아닌 값으로 줬고 zod가 throw →
 * **스타일링룸 하루치 초안이 통째로 0**이 됐다. 사장님이 아침에 빈 화면을 본다.
 * 해시태그 몇 개 때문에 본문까지 버리는 건 값이 안 맞는 거래다.
 * 필수는 제목·본문뿐이고, 나머지는 정규화하거나 비워서 통과시킨다.
 */
export const draftOutputSchema = z.object({
  title: z.string().min(1).max(120),
  bodyHtml: z.string().min(50),
  tags: z.preprocess(toStringArray, z.array(z.string()).max(15)),
  suggestedPhotoOrder: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && (n as number) >= 0) : []),
    z.array(z.number().int().min(0)),
  ),
  qualityNotes: z.preprocess((v) => (Array.isArray(v) ? v.map(String) : undefined), z.array(z.string()).optional()),
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
  /**
   * 직전 generate가 폴백 모델(lite)로 만들어졌는지.
   * 파일럿에서 매장이 늘면 flash 무료 20/일이 소진돼 **품질이 조용히 강등**되는데,
   * 지금은 크론 로그에만 남아 아무도 모른다 → 호출부가 기록·경보할 수 있게 노출.
   */
  usedFallback(): boolean;
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
  // generate 1회 동안 폴백이 한 번이라도 쓰였는지(품질 추적용)
  let fellBack = false;
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
      fellBack = true;
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

    usedFallback: () => fellBack,

    async generate(input) {
      fellBack = false; // 이번 호출 기준으로 초기화
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

      // 재생성은 **총 1회**. 파싱이든 스키마든 한 번만 더 시도한다(쿼터·지연을 아낀다).
      const regenerate = () =>
        callWithFallback(
          writingModelName, systemInstruction,
          { temperature, responseMimeType: 'application/json' },
          industry.writingTemplate(plan, input),
        );

      let parsed: unknown;
      let retried = false;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // 간헐적 출력 절단(특히 flash-lite) → 본문 1회 재생성으로 흡수
        console.warn('[gemini] JSON 절단/파싱 실패 → 본문 재생성 1회');
        retried = true;
        const retry = await regenerate();
        try {
          parsed = JSON.parse(retry);
        } catch (err2) {
          throw new Error(
            `Gemini 응답 JSON 파싱 실패(재시도 포함): ${(err2 as Error).message}\n원문 앞 300자:\n${retry.slice(0, 300)}`,
          );
        }
      }

      let result = draftOutputSchema.safeParse(parsed);
      if (!result.success && !retried) {
        // 여기까지 오면 제목·본문이 빠졌다는 뜻(부가 필드는 위에서 정규화된다)
        const why = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}:${i.code}`).join(', ');
        console.warn(`[gemini] 스키마 불일치(${why}) → 본문 재생성 1회`);
        try {
          result = draftOutputSchema.safeParse(JSON.parse(await regenerate()));
        } catch {
          /* 재시도 파싱 실패는 아래 공통 처리 */
        }
      }
      if (!result.success) {
        throw new Error(
          `Gemini 응답 스키마 불일치(재시도 포함): ${result.error.issues
            .map((i) => `${i.path.join('.') || '(root)'} — ${i.message}`)
            .join(' / ')}`,
        );
      }

      // 지어낸 지역 태그를 여기서 뺀다 — **마스터가 만들어지는 유일한 지점**이라
      // 크론·웹 컴포저·웰컴 초안이 전부 이 필터를 지난다.
      // 예전엔 단문 재작성 쪽에만 걸려 있어서 블로그 태그의 `#강남수학`이 그대로 나갔다(반쪽 수정).
      const address = input.place?.address || input.store.address;
      const tags = dropFabricatedRegionTags(result.data.tags, address);
      if (tags.length !== result.data.tags.length) {
        const dropped = result.data.tags.filter((t) => !tags.includes(t));
        console.warn(`[gemini] 주소에 없는 지역 태그 제거: ${dropped.join(', ')} (주소: ${address || '없음'})`);
      }
      return { ...result.data, tags };
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
  // 태그는 본문 규칙 밖이라 그냥 빠져나갔다 — 주소 없는 학원에 `#강남수학`·`#역삼수학`(2026-08-18 실측).
  // 모델은 업종마다 정해진 동네를 기본값처럼 뱉는다. 손님이 엉뚱한 동네에서 찾게 된다.
  facts.push(
    address
      ? `6. **해시태그의 지역명은 위 주소에 나온 지역만** 쓸 것. 다른 동네·상권 이름을 붙이지 말 것.`
      : `6. **해시태그에 지역명을 쓰지 말 것** — 주소를 모르므로 어떤 동네도 사실이 아니다. 업종·소재 태그만 쓴다.`,
  );
  return facts.join('\n');
}
