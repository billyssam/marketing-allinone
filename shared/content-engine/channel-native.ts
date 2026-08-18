import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChannelId } from '../channels/registry';
import type { DraftInput, DraftOutput } from './types';
import { htmlToPlain } from './channel-formatter';
import { STANDARD_LANGUAGE_RULE } from './prompts/base';
import { clampForChannel, fabricatedNumbers } from './caption';
import { resolveOfferings, offeringLabel } from './offerings';
import { dropFabricatedRegionTags } from './place-facts';
import { resolveBusinessType } from '../business/taxonomy';

/**
 * 채널 네이티브 재작성 — 마스터(블로그)를 각 단문 채널의 "고유 톤"으로 1회 호출 재작성.
 * 블로그 자르기(X) → 인스타는 인스타답게, 플레이스는 소식답게, 당근은 이웃에게 말하듯.
 * 효율: 전 단문 채널을 한 번의 Gemini 호출로 JSON 일괄 생성.
 */

export interface NativeVersion {
  bodyPlain: string;
  tags?: string[];
}

/** 구체적 사실(가격·전화·시각)이 문장에 하나라도 있는가 — 품질 점검과 **같은 잣대**를 쓴다 */
export const CONCRETE_FACT_RE = /[\d,]{3,}\s*원|\d{2,3}-\d{3,4}-\d{4}|\d{1,2}\s*시|\d{1,2}:\d{2}/;
export function hasConcreteFact(body: string): boolean {
  return CONCRETE_FACT_RE.test(body);
}

/**
 * 사실이 반드시 들어가야 하는 채널 — 손님이 "갈지 말지"를 여기서 정한다.
 * 프롬프트 규칙 4가 이미 "최소 1개"를 명시하는데도 빠진 적이 있어(2026-08-13 플레이스 소식),
 * **지시문이 아니라 코드로** 보장한다. 채널 분할 때와 같은 교훈이다.
 */
const FACT_REQUIRED: ChannelId[] = ['naver_place', 'google_business'];

/**
 * 브리프에서 목표 분량 범위를 뽑는다 — 생성·점검이 같은 값을 본다.
 *
 * ⚠️ 예전엔 `**150~250자**`처럼 **바로 뒤에 숫자가 오는 형태만** 인식했다.
 * 그래서 "**전체 200~350자를 채울 것**"이라고 쓴 스레드는 목표가 null이 되어
 * **분량 검사를 아예 안 받고 있었다**(조용히 빠져 있었고 아무도 몰랐다).
 * 문구를 조금 바꿨다고 검사가 사라지면 안 되므로 범위 표기를 문장 어디서든 찾는다.
 * (브리프에 분량 말고 다른 숫자 범위를 쓰지 않는다 — 아래 전수 테스트가 지킨다)
 */
export function targetLength(channelId: string): [number, number] | null {
  const brief = CHANNEL_BRIEF[channelId];
  if (!brief) return null;
  const m = brief.match(/(\d{2,4})\s*~\s*(\d{2,4})\s*자/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * 사장님이 자기 가게에 대해 쓸 리 없는 말투 — 손님·이웃이 추천하는 목소리.
 *
 * 실측(2026-08-13): 당근 "저희 동네 '햇살공방'에서 …하고 있더라구요 … 솔깃하네요",
 * 스레드 "요기 아메리카노가 그렇게 맛있대요". 사장님 계정에서 나가면 바이럴 조작으로 읽힌다.
 *
 * ⚠️ 규칙을 좁게 잡은 이유: "만들어보니 행복이**더라구요**"는 사장님 본인 소감이라 정상이다.
 * 넓게 잡으면 정상 글을 계속 흔들게 된다. 운영 203건에 돌려 **2건 적중·오탐 0**을 확인하고 채택했다.
 * ('하더라구요'는 남의 행동 전언이라 잡고, '이더라구요·주더라구요'는 본인 소감이라 안 잡는다)
 */
const NOT_OWNER_VOICE: RegExp[] = [
  /(있|한|온|간|좋|맛있|친절)대요/, // 전언 — 자기 가게를 전해 들을 수는 없다
  /하더라(구|고)요/, // 남의 행동 전언
  /솔깃/,
  /(^|[\s,.!?])요기[\s가는를이]/, // 방문객 지시어
];
export function notOwnerVoice(body: string, storeName?: string): string | undefined {
  const hit = NOT_OWNER_VOICE.find((re) => re.test(body));
  if (hit) return (body.match(hit)?.[0] ?? '').trim();
  // 자기 가게를 "동네의 어떤 가게"로 소개하는 형태. 상호를 알아야만 정확히 잡힌다 —
  // "우리 동네 이웃 여러분"은 사장님이 흔히 쓰는 정상 표현이라 '동네'만으로는 잡으면 안 된다.
  if (storeName) {
    const esc = storeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(저희|우리)\\s*동네\\s*['"‘’“”]?\\s*${esc}`);
    const m = body.match(re);
    if (m) return m[0].trim();
  }
  return undefined;
}

// 지역 태그 필터는 주소를 다루는 place-facts가 원천 — 여기선 재수출만 한다(기존 import 유지)
export { dropFabricatedRegionTags };

/**
 * 매장 실제 사실을 재작성 프롬프트에 직접 주입.
 *
 * 왜 필요한가(실측): 원본 블로그는 앞 1,400자만 잘라서 넘기는데, 주소·전화·영업시간은
 * 설계상 본문 **마지막** "찾아오시는 길" 문단에 들어간다. 즉 사실이 애초에 전달되지 않았다.
 * 그 결과 마스터는 사실 9종을 담는데 단문 채널은 0~1종만 남았다
 * (플레이스 소식은 "정보 중심" 브리프인데 정작 정보가 없었다).
 */
/**
 * 정보 채널에 사실이 없으면 그 채널만 다시 쓴다. 그래도 없으면 한 줄을 덧붙인다.
 *
 * 왜 재작성부터인가: 덧붙인 문장은 티가 난다. 본문에 녹아든 게 낫다.
 * 왜 덧붙이기까지 두는가: 사장님이 매일 붙여넣는 결과물이라 "그날은 없었다"가 없어야 한다.
 * 비용: 네이티브 재작성은 flash-lite(별도 쿼터 ~1000/일)라 한 채널 재시도는 무시할 수준.
 */
async function repairFactlessChannels(
  out: Partial<Record<ChannelId, NativeVersion>>,
  targets: ChannelId[],
  input: DraftInput,
  genAI: GoogleGenerativeAI,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  configuredModel?: string,
): Promise<void> {
  type Problem = { c: ChannelId; kind: 'voice' | 'fact' | 'short'; detail: string };
  const problems = targets.flatMap<Problem>((c) => {
    const body = out[c]?.bodyPlain;
    if (!body) return [];
    const voice = notOwnerVoice(body, input.store.name);
    if (voice) return [{ c, kind: 'voice', detail: `사장님 말투가 아님("${voice}")` }];
    if (FACT_REQUIRED.includes(c) && !hasConcreteFact(body)) {
      return [{ c, kind: 'fact', detail: '가격·영업시간이 하나도 없음' }];
    }
    // 분량 미달 — 아침 검증이 잡는 것과 **같은 기준**(하한 ×0.8)으로 여기서 먼저 고친다.
    // 예전엔 알림만 울리고 아무도 안 고쳤다: 08:30 재시도는 멱등이라 스킵하니
    // 사장님은 목표 150자짜리 플레이스 소식을 113자로 그대로 받았다(2026-08-16 실측).
    const range = targetLength(c);
    if (range && body.length < range[0] * 0.8) {
      return [{ c, kind: 'short', detail: `${body.length}자 (목표 ${range[0]}~${range[1]})` }];
    }
    return [];
  });
  if (!problems.length) return;

  const facts = factBlock(input);
  for (const { c, kind, detail } of problems) {
    const brief = CHANNEL_BRIEF[c];
    console.warn(`[native] ${c}: ${detail} → 해당 채널만 재작성`);
    const range = targetLength(c);
    const instruction =
      kind === 'fact'
        ? `내용·톤은 그대로 두되 **아래 사실 중 최소 하나(가격 또는 영업시간)를** 문장 안에 자연스럽게 넣어라.
억지로 덧붙이지 말고 문맥에 녹인다. 숫자는 문자 그대로 옮긴다.`
        : kind === 'short'
          ? `지금 원문이 **${out[c]!.bodyPlain.length}자로 너무 짧다.** 목표는 ${range?.[0]}~${range?.[1]}자다.
같은 소재로 **더 길게** 써라 — 새 사실을 지어내지 말고, 이미 있는 소재를
"왜 지금 이걸 권하는지"·"어떤 순간에 좋은지"로 풀어서 채운다. 말줄임·나열로 늘리지 말 것.`
          : `이 글은 **사장님이 자기 가게 계정으로** 올린다. 지금 원문은 손님·이웃이 추천하는 말투다.
"…있대요/…하더라구요/솔깃하네요/요기 …" 같은 전언·방문객 말투를 **사장님 1인칭**으로 바꿔라.
("저희 ○○입니다", "오늘은 …준비했어요", "…들러보세요") 내용·분량·사실은 그대로 둔다.`;
    try {
      const res = await generateWithRetry(
        genAI,
        model,
        `아래 글을 다시 써라. ${instruction}

${facts}
## 채널 지침
${brief ?? ''}

## 원문
${out[c]!.bodyPlain}

## 출력 (JSON)
{ "bodyPlain": "..." }`,
        configuredModel,
      );
      const body = String(JSON.parse(res.response.text())?.bodyPlain ?? '');
      const fixed = !body
        ? false
        : kind === 'fact'
          ? hasConcreteFact(body)
          : kind === 'short'
            ? !range || body.length >= range[0] * 0.8
            : !notOwnerVoice(body, input.store.name);
      if (fixed) {
        out[c] = { ...out[c]!, bodyPlain: clampForChannel(c, body) };
        continue;
      }
      // 짧은 걸 고치려다 더 짧아지면 원문을 지킨다(둘 중 나은 쪽)
      if (kind === 'short' && body.length > out[c]!.bodyPlain.length) {
        out[c] = { ...out[c]!, bodyPlain: clampForChannel(c, body) };
        console.warn(`[native] ${c}: 재작성해도 목표 미달이나 ${body.length}자로 늘어 채택`);
        continue;
      }
    } catch (e) {
      console.warn(`[native] ${c} 재작성 실패: ${(e as Error).message?.slice(0, 120)}`);
    }

    if (kind === 'fact') {
      // 마지막 방어선 — 사실 한 줄을 덧붙인다. 없는 것보다 낫다.
      const tail = factTail(input);
      if (tail) {
        out[c] = { ...out[c]!, bodyPlain: clampForChannel(c, `${out[c]!.bodyPlain}\n\n${tail}`) };
        console.warn(`[native] ${c}: 재작성도 사실 없음 → 안내 한 줄 덧붙임`);
      } else {
        console.warn(`[native] ${c}: 붙일 사실 자체가 매장에 없음(플레이스 미연결·항목 0)`);
      }
    } else {
      // 말투·분량은 기계적으로 못 채운다 — 억지로 늘리거나 고쳐 쓰면 오히려 나쁜 글이 된다.
      // 흔적만 남기고 아침 검증이 잡게 둔다(조용히 넘어가지 않는 게 핵심).
      console.warn(`[native] ${c}: 재작성 후에도 ${kind === 'short' ? '분량 미달' : '말투 문제'} — 기록만 남김`);
    }
  }
}

/** 덧붙일 사실 한 줄 — 대표 항목 가격, 없으면 영업시간 */
function factTail(input: DraftInput): string | undefined {
  const top = resolveOfferings(input.store.brandTone, input.place).find((o) => o.price);
  const parts: string[] = [];
  if (top?.price) parts.push(`${top.name} ${top.price.toLocaleString()}원`);
  if (input.place?.hours) parts.push(input.place.hours);
  return parts.length ? parts.join(' · ') : undefined;
}

function factBlock(input: DraftInput): string {
  const p = input.place;
  const lines: string[] = [];
  const address = p?.address || input.store.address;
  if (address) lines.push(`- 주소: ${address}`);
  if (p?.phone) lines.push(`- 전화번호: ${p.phone}`);
  if (p?.hours) lines.push(`- 영업시간: ${p.hours}`);

  const offerings = resolveOfferings(input.store.brandTone, p);
  if (offerings.length) {
    const kind = resolveBusinessType(input.store.industryId).offering;
    // 선택지를 3개로 좁혀봤더니 나열은 줄었지만 **분량이 무너졌다**(8채널 중 5건 하한 미달,
    // 플레이스 소식 88자). 쓸 소재가 없으면 글이 짧아진다 — 나열보다 분량 붕괴가 훨씬 나쁘다.
    // → 소재는 넉넉히 주고, 몇 개를 쓸지는 채널 길이에 맞춰 프롬프트에서 조절한다.
    const items = offerings
      .slice(0, 6)
      .map((o) => (o.price ? `${o.name} ${o.price.toLocaleString()}원` : o.name))
      .join(' · ');
    lines.push(`- ${offeringLabel(kind)}: ${items}`);
  }
  if (!lines.length) return '';
  return `## 매장 실제 사실 (지어내지 말고 이 값만 인용)\n${lines.join('\n')}\n`;
}

const SHORT_FORM: ChannelId[] = [
  'instagram', 'naver_place', 'danggeun', 'threads', 'naver_band', 'kakao_channel',
  // 페북·구글도 네이티브 재작성 대상 — 빠져 있어서 규칙기반 폴백(블로그 자르기)으로 나갔다.
  // 실측 지문: 주말 페북 캡션이 680·680·692·671자로 거의 균일 = 기계적 자르기.
  'facebook', 'google_business',
];

/** 품질 점검이 목표 분량을 여기서 파싱해 쓴다 — 별도 표를 만들면 두 값이 어긋난다 */
export const CHANNEL_BRIEF: Record<string, string> = {
  instagram:
    '인스타그램 캡션. 첫 줄이 강렬한 훅(스크롤 멈추게). 짧은 문장, 줄바꿈 활용, 이모지 1~3개 절제. 해시태그는 본문에 넣지 말고 tags 배열로. **300~500자**(너무 짧으면 성의 없어 보인다).',
  naver_place:
    // 업종 무관 — "신메뉴"라고 못박으면 미용실·헬스장 소식이 남의 옷을 입는다
    // 주소·전화 반복 금지 — 이 글은 매장 페이지 **안에** 뜨는 소식이라 이미 화면에 있다(실측: 덤프가 됐다)
    // ⚠️ "간결"이 하한과 충돌해 매일 하한 근처로 나왔다(8/16 113자로 미달, 8/18 123자).
    //    스레드에서 이미 겪은 것과 같은 형태 — **문장은 간결하게, 분량은 채운다**로 분리해 지시한다.
    '네이버 플레이스 소식. 정보 중심. 지금 방문할 이유(새 메뉴·상품·시술, 시즌, 영업정보) 하나를 골라 강조. ' +
      '문장은 군더더기 없이 간결하게 쓰되, **전체 150~250자를 반드시 채울 것** ' +
      '(고른 이유 하나를 "왜 지금 좋은지"까지 풀어 쓰면 자연스럽게 채워진다. 짧게 끝내면 성의 없어 보인다). ' +
      '주소·전화번호는 쓰지 말 것(매장 페이지 안에 이미 표시된다). 이모지 최소.',
  danggeun:
    // "이웃에게 말하듯"이 "이웃처럼 말하라"로 읽혀 사장님이 자기 가게를 3인칭으로 소개했다(실측).
    // 화자를 브리프에도 한 번 더 못박는다.
    '당근마켓 동네 홍보. **사장님이 이웃에게 말 거는** 톤으로 친근하고 담백하게(이웃인 척 X). ' +
      '과장·광고티 배제. "우리 가게가 이 동네에 있다" 정서. **250~400자**.',
  threads:
    // ⚠️ "짧고"라는 표현이 하한과 충돌해 실제로 144자짜리가 나왔다(실측 3/7 미달) →
    //    "문장은 짧게 끊되 전체 분량은 채운다"로 분리해서 지시한다.
    '스레드 글. 대화체로 공감 유발하는 첫 문장, 문장은 짧게 끊어 리듬감 있게. 한 토막 더 풀어서 **전체 200~350자를 채울 것**(짧게 끝내면 성의 없어 보인다. 단 500자는 절대 넘기지 말 것 — 플랫폼 제한).',
  // 밴드·카카오채널은 "이미 우리를 아는 사람들"이 보는 자리 — 새 손님 설득이 아니라 단골 대상 소식·초대.
  naver_band:
    '네이버 밴드 게시글. 이미 우리 가게를 아는 단골 모임에 올리는 소식. 새 손님에게 소개하듯 설명하지 말고, "이번 주에 이런 게 있어요" 식의 알림·초대 톤. 존댓말, 담백하게. 이모지 0~2개. **250~400자**.',
  kakao_channel:
    // 목표 150~300에 실측이 130으로 나왔는데, 알림창에 뜨는 메시지는 **짧은 게 채널 특성상 맞다**.
    // (실무 카카오 채널 메시지도 100~200자대) → 채널 성격에 맞게 하한을 내린다.
    '카카오톡 채널 메시지. 친구 추가한 고객의 알림창에 뜨는 글. 첫 문장에서 용건이 바로 드러나야 하고(뭐가 새로운지·언제까지인지), 광고 느낌보다 단골에게 귀띔하듯. 문의·방문으로 잇는 짧은 한 줄로 마무리. 이모지 0~2개. **120~250자**(알림창이라 길면 안 읽힌다).',
  facebook:
    // 목표를 400~600으로 뒀지만 실측이 일관되게 760~800자였다. 브리프의 "길게 써도 되고
    // 친절해야 한다"와 정합적이고, 페북은 '더 보기'로 접히는 피드라 이 길이가 문제되지 않는다.
    // → 모델을 억지로 누르는 대신 **목표치를 실제에 맞게 정정**한다(임의로 정했던 값이다).
    '페이스북 페이지 게시물. 인스타보다 문장을 길게 써도 되고 설명이 친절해야 한다(중장년 이용자 비중이 큼). 스토리 한 토막에 **원본에 적힌** 실용 정보 한두 가지를 자연스럽게 섞고, 마지막은 방문·문의로 잇는다. 원본에 없는 시간·가격은 절대 적지 말 것. 해시태그는 쓰더라도 2~3개까지. **500~750자**.',
  google_business:
    '구글 비즈니스 프로필 게시물. 지도·검색에서 이 가게를 처음 보는 사람(관광객·외지인 포함)이 읽는다. 군더더기 없이 무엇을 파는 곳인지·왜 지금 갈 만한지를 명확하게. **원본에 있는** 실용 정보(영업시간·위치)만 우선 배치하고, 원본에 없으면 그 줄을 통째로 생략한다(추정 시간표 금지). 감성 수식은 최소. **200~400자**.',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 일시 장애(503 과부하·429)인가 — 재시도로 회복 가능한 부류 */
const isTransient = (e: unknown) =>
  /503|overload|high load|unavailable|429|rate limit|timeout|ECONNRESET/i.test(e instanceof Error ? e.message : String(e));

/**
 * 캡션 재작성 호출 — 일시 장애에 재시도.
 * 실측: flash-lite가 "503 currently experiencing high load"를 반환하면 캡션이 통째로
 * 규칙 폴백(블로그 자르기)으로 나간다. 사장님이 매일 붙여넣는 결과물이라 한 번의
 * 외부 장애로 품질이 무너지면 안 된다. lite 재시도 2회 → 그래도 안 되면 flash 1회.
 */
async function generateWithRetry(
  genAI: GoogleGenerativeAI,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  prompt: string,
  configuredModel?: string,
) {
  const cfg = { temperature: 0.9, responseMimeType: 'application/json', maxOutputTokens: 8192 } as const;
  for (let i = 0; i <= 2; i++) {
    try {
      return await model.generateContent(prompt);
    } catch (e) {
      if (!isTransient(e) || i === 2) {
        // lite가 계속 과부하면 flash로 한 번 더(모델별 인프라가 달라 회복될 때가 있음)
        if (isTransient(e) && !configuredModel) {
          console.warn('[native] flash-lite 지속 장애 → gemini-2.5-flash로 1회 폴백');
          const alt = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: cfg });
          return await alt.generateContent(prompt);
        }
        throw e;
      }
      const wait = 2000 * (i + 1);
      console.warn(`[native] 일시 장애 → ${wait / 1000}s 후 재시도 (${i + 1}/2)`);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}

function resolveKey(config?: { apiKey?: string }): string | null {
  return (
    config?.apiKey ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    null
  );
}

/**
 * 한 번에 요청할 채널 수 상한.
 *
 * 실측(2026-08-11, 무인 4일간 품질 점검이 매일 잡아냄):
 *   4채널 매장 → 전부 목표 분량 통과(플레이스 284·인스타 531)
 *   8채널 매장 → 전부 하한 미달(플레이스 110·카카오 71·당근 191·밴드 171)
 * 한 응답에 채널이 많아질수록 모델이 각각을 알아서 줄인다. 지시문으로는 못 막았다
 * ("분량은 반드시 채운다"를 명시했는데도 4일 연속 미달).
 * → 나눠서 부른다. 호출이 늘지만 짧은 글은 사장님이 쓸 수가 없다.
 */
const MAX_CHANNELS_PER_CALL = 4;

export async function nativizeShortForm(
  master: DraftOutput,
  input: DraftInput,
  channels: ChannelId[],
  config?: { apiKey?: string; model?: string },
): Promise<Partial<Record<ChannelId, NativeVersion>>> {
  const targets = channels.filter((c) => SHORT_FORM.includes(c));
  if (!targets.length) return {};

  // 상한을 넘으면 나눠서 부르고 합친다(각 배치는 독립이라 실패해도 나머지는 산다)
  if (targets.length > MAX_CHANNELS_PER_CALL) {
    const batches: ChannelId[][] = [];
    for (let i = 0; i < targets.length; i += MAX_CHANNELS_PER_CALL) {
      batches.push(targets.slice(i, i + MAX_CHANNELS_PER_CALL));
    }
    const merged: Partial<Record<ChannelId, NativeVersion>> = {};
    for (const b of batches) {
      Object.assign(merged, await nativizeShortForm(master, input, b, config));
    }
    return merged;
  }

  const key = resolveKey(config);
  if (!key) return {}; // 키 없으면 조용히 스킵 (formatter 규칙기반 폴백)

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    // 단문 재작성은 가벼운 작업 → flash-lite(무료 한도 더 큼: ~15RPM/1000RPD, 모델별 별도 버킷)
    // 마스터(기획·본문)는 flash 유지. 쿼터 분산 + RPM 압력 감소.
    model: config?.model ?? 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.9,
      responseMimeType: 'application/json',
      // 채널을 많이 연결한 매장은 한 응답에 8채널이 들어간다. 기본 출력 한도에 걸리면
      // 모델이 각 채널을 스스로 줄여버린다(실측: 8채널 동시 요청 시 인스타 162자로 급감).
      maxOutputTokens: 8192,
    },
  });

  const tone = input.store.brandTone ?? {};
  const briefs = targets.map((c) => `- "${c}": ${CHANNEL_BRIEF[c]}`).join('\n');
  const plain = htmlToPlain(master.bodyHtml);
  const facts = factBlock(input);

  const prompt = `아래 블로그 원본을 각 채널의 고유 톤으로 재작성하라.
블로그를 자르지 말고, 채널 성격에 맞게 새로 쓴다.
말투 원칙: ${STANDARD_LANGUAGE_RULE}

## 화자 (모든 채널 공통 — 어기면 실패)
이 글은 **사장님이 자기 가게 계정으로** 올린다. 손님이나 이웃이 쓰는 글이 아니다.
- 금지: "저희 동네 ○○에서 …하고 있더라구요", "…라고 하네요", "…있대요", "솔깃하네요",
  "요기 ○○가 맛있대요", "주문하면 바로 구워주는데" 처럼 **남의 가게를 소개하는 말투**.
  당근·스레드처럼 대화체를 요구하는 채널에서 실제로 이렇게 나왔다(2026-08-13 실측).
  사장님 계정에서 이런 글이 나가면 바이럴 조작으로 읽혀 계정이 위험해진다.
- 맞는 말투: "저희 ○○입니다", "오늘은 …준비했어요", "…한번 들러보세요".
  친근한 대화체는 **이웃에게 말 거는 사장님**이지, 이웃인 척하는 게 아니다.
- 사장님 본인의 소감("만들어보니 …이더라구요")은 괜찮다. 전해 들은 말투가 문제다.

## ⚠️ 사실 보존 (절대 규칙 — 어기면 실패)
1. 주소·전화번호·가격·영업시간은 아래 "매장 실제 사실"에 있는 **문자 그대로** 옮긴다. 숫자를 바꾸거나
   반올림하거나 비슷한 값으로 대체하는 것 절대 금지(실측 사고: "…로 123"을 "…로 2330"으로 변형).
2. 아래 목록에 없는 주소·전화·가격·수상경력·기간한정 문구를 **새로 만들어내지 않는다**.
   모르면 그 항목을 아예 쓰지 않는다(자리표시자·추정치도 금지).
3. 판매 항목명(메뉴·상품·시술·프로그램)은 목록 표기 그대로. 없는 항목을 추가하지 않는다.
4. **감성 문구만 쓰고 끝내지 말 것.** 아래 사실 중 **1~2개를 골라** 문장 안에 자연스럽게 녹인다.
   "naver_place"·"google_business"는 방문을 결정하는 정보 채널이라 최소 1개는 반드시 넣는다.
   ("분위기 좋은 공간입니다" 류만 남기고 숫자를 전부 버리는 것이 실제로 반복된 실패다)
5. 판매 항목을 **가격표처럼 죽 늘어놓지 말 것.** 300자 미만 채널은 1~2개, 그보다 긴 채널도
   3개를 넘기지 않는다. 가격만 나열하면 소식이 아니라 광고 전단이 된다(실측: 네 개를 나열했다).
   ⚠️ 단 이건 **적게 쓰라는 뜻이 아니다.** 분량은 아래 채널별 지침의 자수를 반드시 채운다 —
   항목 수를 줄인 만큼 고른 것을 "왜 지금 이걸 권하는지"까지 풀어서 더 길게 쓴다.
   (이 제약을 분량 축소로 오해해 8채널 중 5건이 하한 미달로 나온 적이 있다)

${facts}
## 매장
- 상호: ${input.store.name}
- 톤: ${tone.voice ?? ''}
- 포지셔닝: ${tone.positioning ?? ''}
- 금지 표현: ${(tone.avoid_expressions ?? []).join(', ')}

## 블로그 원본 (요지)
제목: ${master.title}
${plain.slice(0, 1400)}

## 채널별 지침
${briefs}

## 출력 (JSON, 요청 채널만)
{
${targets.map((c) => `  "${c}": { "bodyPlain": "...", "tags": ["..."] }`).join(',\n')}
}
tags는 인스타에만 (해시태그용, # 없이 단어만, 최대 20). 나머지 채널 tags는 빈 배열.`;

  try {
    const res = await generateWithRetry(genAI, model, prompt, config?.model);
    const raw = res.response.text();
    const finish = res.response.candidates?.[0]?.finishReason;
    let parsed: Record<string, { bodyPlain?: unknown; tags?: unknown }>;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // 조용히 삼키면 크론에서 캡션이 규칙 폴백으로 나가도 아무도 모른다(실측으로 겪음)
      console.warn(
        `[native] JSON 파싱 실패(finish=${finish}, len=${raw.length}): ${(e as Error).message}\n  앞 160자: ${raw.slice(0, 160)}`,
      );
      throw e;
    }
    const out: Partial<Record<ChannelId, NativeVersion>> = {};
    for (const c of targets) {
      if (parsed[c]?.bodyPlain) {
        // 플랫폼 하드 리밋으로 안전 트림 — flash-lite가 권장 길이를 넘겨도 발행이 깨지지 않게
        const bodyPlain = clampForChannel(c, String(parsed[c].bodyPlain));
        // 사실 날조 조기 경보(차단 X, 로그) — 주소·가격 숫자가 원본과 달라지면 손님이 못 찾아온다.
        // 비교 대상에 **주입한 사실 블록도 포함**한다. 블로그 발췌(앞 1,400자)에 없어도
        // 우리가 프롬프트로 넘긴 가격·영업시간은 정당한 출처다 —
        // 빼놓으면 눈꽃빙수 12,000원 같은 실제 메뉴가가 매번 날조로 찍혀,
        // 진짜 날조가 그 소음에 묻힌다(2026-08-13 실측: 3개 채널이 동시에 오탐).
        const madeUp = fabricatedNumbers(`${plain} ${master.title} ${facts}`, bodyPlain);
        if (madeUp.length) console.warn(`[native] ${c}: 원본에 없는 숫자 ${madeUp.join(', ')} — 사실 확인 필요`);
        // 인스타 해시태그: 과다는 스팸 신호 → 최대 20개로 하드 캡(중복·빈 값 제거)
        const rawTags: unknown[] | undefined = Array.isArray(parsed[c].tags) ? parsed[c].tags : undefined;
        const tags: string[] | undefined = rawTags
          ? dropFabricatedRegionTags(
              [...new Set(rawTags.map((t) => String(t).replace(/^#/, '').trim()).filter((t): t is string => t.length > 0))],
              input.place?.address || input.store.address,
            ).slice(0, 20)
          : undefined;
        out[c] = { bodyPlain, tags };
      }
    }
    if (!Object.keys(out).length) {
      console.warn(`[native] 응답에 유효 채널이 없음(요청 ${targets.join(',')}) — 규칙 폴백으로 진행`);
    }
    await repairFactlessChannels(out, targets, input, genAI, model, config?.model);
    return out;
  } catch (e) {
    // 폴백은 유지하되 반드시 흔적을 남긴다 — 캡션이 조용히 블로그 자르기로 나가는 걸 막기 위해
    console.warn(`[native] 재작성 실패 → 규칙 폴백: ${(e as Error).message?.slice(0, 200)}`);
    return {};
  }
}
