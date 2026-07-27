import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChannelId } from '../channels/registry';
import type { DraftInput, DraftOutput } from './types';
import { htmlToPlain } from './channel-formatter';
import { STANDARD_LANGUAGE_RULE } from './prompts/base';
import { clampForChannel, fabricatedNumbers } from './caption';

/**
 * 채널 네이티브 재작성 — 마스터(블로그)를 각 단문 채널의 "고유 톤"으로 1회 호출 재작성.
 * 블로그 자르기(X) → 인스타는 인스타답게, 플레이스는 소식답게, 당근은 이웃에게 말하듯.
 * 효율: 전 단문 채널을 한 번의 Gemini 호출로 JSON 일괄 생성.
 */

export interface NativeVersion {
  bodyPlain: string;
  tags?: string[];
}

const SHORT_FORM: ChannelId[] = [
  'instagram', 'naver_place', 'danggeun', 'threads', 'naver_band', 'kakao_channel',
  // 페북·구글도 네이티브 재작성 대상 — 빠져 있어서 규칙기반 폴백(블로그 자르기)으로 나갔다.
  // 실측 지문: 주말 페북 캡션이 680·680·692·671자로 거의 균일 = 기계적 자르기.
  'facebook', 'google_business',
];

const CHANNEL_BRIEF: Record<string, string> = {
  instagram:
    '인스타그램 캡션. 첫 줄이 강렬한 훅(스크롤 멈추게). 짧은 문장, 줄바꿈 활용, 이모지 1~3개 절제. 해시태그는 본문에 넣지 말고 tags 배열로. 500자 이내.',
  naver_place:
    '네이버 플레이스 소식. 정보 중심·간결. 지금 방문할 이유(신메뉴·시즌·영업정보) 강조. 이모지 최소. 250자 이내.',
  danggeun:
    '당근마켓 동네 홍보. 옆집 이웃에게 말하듯 친근하고 담백하게. 과장·광고티 배제. "우리 동네" 정서. 400자 이내.',
  threads:
    '스레드 글. 짧고 후킹, 대화체. 공감 유발 첫 문장. 350자 이내(절대 500자 넘기지 말 것 — 플랫폼 제한).',
  // 밴드·카카오채널은 "이미 우리를 아는 사람들"이 보는 자리 — 새 손님 설득이 아니라 단골 대상 소식·초대.
  naver_band:
    '네이버 밴드 게시글. 이미 우리 가게를 아는 단골 모임에 올리는 소식. 새 손님에게 소개하듯 설명하지 말고, "이번 주에 이런 게 있어요" 식의 알림·초대 톤. 존댓말, 담백하게. 이모지 0~2개. 400자 이내.',
  kakao_channel:
    '카카오톡 채널 메시지. 친구 추가한 고객의 알림창에 뜨는 글. 첫 문장에서 용건이 바로 드러나야 하고(뭐가 새로운지·언제까지인지), 광고 느낌보다 단골에게 귀띔하듯. 문의·방문으로 잇는 짧은 한 줄로 마무리. 이모지 0~2개. 300자 이내.',
  facebook:
    '페이스북 페이지 게시물. 인스타보다 문장을 길게 써도 되고 설명이 친절해야 한다(중장년 이용자 비중이 큼). 스토리 한 토막에 **원본에 적힌** 실용 정보(가격·영업시간·위치)를 자연스럽게 섞고, 마지막은 방문·문의로 잇는다. 원본에 없는 시간·가격은 절대 적지 말 것. 해시태그는 쓰더라도 2~3개까지. 600자 이내.',
  google_business:
    '구글 비즈니스 프로필 게시물. 지도·검색에서 이 가게를 처음 보는 사람(관광객·외지인 포함)이 읽는다. 군더더기 없이 무엇을 파는 곳인지·왜 지금 갈 만한지를 명확하게. **원본에 있는** 실용 정보(영업시간·위치)만 우선 배치하고, 원본에 없으면 그 줄을 통째로 생략한다(추정 시간표 금지). 감성 수식은 최소. 400자 이내.',
};

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
    generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
  });

  const tone = input.store.brandTone ?? {};
  const briefs = targets.map((c) => `- "${c}": ${CHANNEL_BRIEF[c]}`).join('\n');
  const plain = htmlToPlain(master.bodyHtml);

  const prompt = `아래 블로그 원본을 각 채널의 고유 톤으로 재작성하라.
블로그를 자르지 말고, 채널 성격에 맞게 새로 쓴다.
말투 원칙: ${STANDARD_LANGUAGE_RULE}

## ⚠️ 사실 보존 (절대 규칙 — 어기면 실패)
1. 주소·전화번호·가격·영업시간은 원본에 있는 **문자 그대로** 옮긴다. 숫자를 바꾸거나
   반올림하거나 비슷한 값으로 대체하는 것 절대 금지(실측 사고: "…로 123"을 "…로 2330"으로 변형).
2. 원본에 없는 주소·전화·가격·수상경력·기간한정 문구를 **새로 만들어내지 않는다**.
   모르면 그 항목을 아예 쓰지 않는다(자리표시자·추정치도 금지).
3. 메뉴·상품명은 원본 표기 그대로. 없는 메뉴를 추가하지 않는다.

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
    const res = await model.generateContent(prompt);
    const parsed = JSON.parse(res.response.text());
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
    return out;
  } catch {
    return {}; // 실패 시 규칙기반 폴백
  }
}
