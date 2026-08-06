import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChannelId } from '../channels/registry';
import type { DraftInput, DraftOutput } from './types';
import { htmlToPlain } from './channel-formatter';
import { STANDARD_LANGUAGE_RULE } from './prompts/base';
import { clampForChannel, fabricatedNumbers } from './caption';
import { resolveOfferings, offeringLabel } from './offerings';
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

/**
 * 매장 실제 사실을 재작성 프롬프트에 직접 주입.
 *
 * 왜 필요한가(실측): 원본 블로그는 앞 1,400자만 잘라서 넘기는데, 주소·전화·영업시간은
 * 설계상 본문 **마지막** "찾아오시는 길" 문단에 들어간다. 즉 사실이 애초에 전달되지 않았다.
 * 그 결과 마스터는 사실 9종을 담는데 단문 채널은 0~1종만 남았다
 * (플레이스 소식은 "정보 중심" 브리프인데 정작 정보가 없었다).
 */
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
    '네이버 플레이스 소식. 정보 중심·간결. 지금 방문할 이유(새 메뉴·상품·시술, 시즌, 영업정보) 하나를 골라 강조. ' +
      '주소·전화번호는 쓰지 말 것(매장 페이지 안에 이미 표시된다). 이모지 최소. **150~250자**.',
  danggeun:
    '당근마켓 동네 홍보. 옆집 이웃에게 말하듯 친근하고 담백하게. 과장·광고티 배제. "우리 동네" 정서. **250~400자**.',
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

export async function nativizeShortForm(
  master: DraftOutput,
  input: DraftInput,
  channels: ChannelId[],
  config?: { apiKey?: string; model?: string },
): Promise<Partial<Record<ChannelId, NativeVersion>>> {
  const targets = channels.filter((c) => SHORT_FORM.includes(c));
  if (!targets.length) return {};

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
        // 사실 날조 조기 경보(차단 X, 로그) — 주소·가격 숫자가 원본과 달라지면 손님이 못 찾아온다
        const madeUp = fabricatedNumbers(plain + ' ' + master.title, bodyPlain);
        if (madeUp.length) console.warn(`[native] ${c}: 원본에 없는 숫자 ${madeUp.join(', ')} — 사실 확인 필요`);
        // 인스타 해시태그: 과다는 스팸 신호 → 최대 20개로 하드 캡(중복·빈 값 제거)
        const rawTags: unknown[] | undefined = Array.isArray(parsed[c].tags) ? parsed[c].tags : undefined;
        const tags: string[] | undefined = rawTags
          ? [...new Set(rawTags.map((t) => String(t).replace(/^#/, '').trim()).filter((t): t is string => t.length > 0))].slice(0, 20)
          : undefined;
        out[c] = { bodyPlain, tags };
      }
    }
    if (!Object.keys(out).length) {
      console.warn(`[native] 응답에 유효 채널이 없음(요청 ${targets.join(',')}) — 규칙 폴백으로 진행`);
    }
    return out;
  } catch (e) {
    // 폴백은 유지하되 반드시 흔적을 남긴다 — 캡션이 조용히 블로그 자르기로 나가는 걸 막기 위해
    console.warn(`[native] 재작성 실패 → 규칙 폴백: ${(e as Error).message?.slice(0, 200)}`);
    return {};
  }
}
