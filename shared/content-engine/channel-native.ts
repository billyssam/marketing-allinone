import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChannelId } from '../channels/registry';
import type { DraftInput, DraftOutput } from './types';
import { htmlToPlain } from './channel-formatter';

/**
 * 채널 네이티브 재작성 — 마스터(블로그)를 각 단문 채널의 "고유 톤"으로 1회 호출 재작성.
 * 블로그 자르기(X) → 인스타는 인스타답게, 플레이스는 소식답게, 당근은 이웃에게 말하듯.
 * 효율: 전 단문 채널을 한 번의 Gemini 호출로 JSON 일괄 생성.
 */

export interface NativeVersion {
  bodyPlain: string;
  tags?: string[];
}

const SHORT_FORM: ChannelId[] = ['instagram', 'naver_place', 'danggeun', 'threads'];

const CHANNEL_BRIEF: Record<string, string> = {
  instagram:
    '인스타그램 캡션. 첫 줄이 강렬한 훅(스크롤 멈추게). 짧은 문장, 줄바꿈 활용, 이모지 1~3개 절제. 해시태그는 본문에 넣지 말고 tags 배열로. 500자 이내.',
  naver_place:
    '네이버 플레이스 소식. 정보 중심·간결. 지금 방문할 이유(신메뉴·시즌·영업정보) 강조. 이모지 최소. 250자 이내.',
  danggeun:
    '당근마켓 동네 홍보. 옆집 이웃에게 말하듯 친근하고 담백하게. 과장·광고티 배제. "우리 동네" 정서. 400자 이내.',
  threads:
    '스레드 글. 짧고 후킹, 대화체. 공감 유발 첫 문장. 350자 이내.',
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
    model: config?.model ?? 'gemini-2.5-flash',
    generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
  });

  const tone = input.store.brandTone ?? {};
  const briefs = targets.map((c) => `- "${c}": ${CHANNEL_BRIEF[c]}`).join('\n');
  const plain = htmlToPlain(master.bodyHtml);

  const prompt = `아래 블로그 원본을 각 채널의 고유 톤으로 재작성하라.
블로그를 자르지 말고, 채널 성격에 맞게 새로 쓴다. 사실(주소·메뉴·가격)은 원본과 일치시킨다.
말투는 **표준어**로 쓴다. 매장 톤은 성격·분위기 지침일 뿐이며, "시골"·"푸근함" 같은 표현이 있어도 사투리로 옮기지 않는다(톤에 특정 사투리를 명시적으로 요구한 경우에만 그 사투리 하나로 일관되게, 지역 혼용 금지).

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
        out[c] = { bodyPlain: String(parsed[c].bodyPlain), tags: Array.isArray(parsed[c].tags) ? parsed[c].tags : undefined };
      }
    }
    return out;
  } catch {
    return {}; // 실패 시 규칙기반 폴백
  }
}
