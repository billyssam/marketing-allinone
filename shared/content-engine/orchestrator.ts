import type { DraftContent } from '../channels/adapter';
import type { ChannelId } from '../channels/registry';
import { createGeminiClient, type GeminiClientConfig } from './gemini-client';
import { formatForChannel, formatForChannels, type MasterImage } from './channel-formatter';
import { nativizeShortForm } from './channel-native';
import type { DraftInput, DraftOutput } from './types';

/**
 * B구간 핵심 오케스트레이터.
 * 사진·매장정보 하나 → Gemini로 마스터 콘텐츠 1회 생성 → 채널별 DraftContent 재단.
 * "한 번 만들고 전 채널로 뿌린다"의 실제 구현.
 */
export interface ChannelDraftBundle {
  master: DraftOutput;
  perChannel: Record<string, DraftContent>;
  channels: ChannelId[];
}

export async function generateChannelDrafts(
  input: DraftInput,
  channels: ChannelId[],
  images: MasterImage[] = [],
  config?: GeminiClientConfig,
): Promise<ChannelDraftBundle> {
  const gemini = createGeminiClient(config);
  const master = await gemini.generate(input);

  // 규칙기반 재단(전 채널) + 단문 채널은 네이티브 재작성으로 교체 (1회 호출)
  const perChannel = formatForChannels(master, channels, images);
  const native = await nativizeShortForm(master, input, channels, config);
  for (const [ch, ver] of Object.entries(native)) {
    const base = perChannel[ch];
    if (!base || !ver) continue;
    perChannel[ch] = {
      ...base,
      bodyPlain: ch === 'instagram' && ver.tags?.length
        ? `${ver.bodyPlain}\n\n${ver.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}`
        : ver.bodyPlain,
      tags: ver.tags?.length ? ver.tags.slice(0, 30) : base.tags,
      meta: { ...base.meta, native: true },
    };
  }
  return { master, perChannel, channels };
}

/** 이미 생성된 마스터가 있을 때(재발행·수정) — Gemini 호출 없이 재포맷만 */
export function reformat(
  master: DraftOutput,
  channels: ChannelId[],
  images: MasterImage[] = [],
): ChannelDraftBundle {
  return { master, perChannel: formatForChannels(master, channels, images), channels };
}
