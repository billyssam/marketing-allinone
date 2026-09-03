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
  /**
   * 마스터가 폴백 모델(lite)로 만들어졌는지 = 그날 flash 쿼터가 소진됐다는 신호.
   * 파일럿에서 매장이 늘면 품질이 조용히 강등되므로 저장·경보로 드러낸다.
   */
  degraded: boolean;
  /**
   * 마스터를 **깨진 JSON에서 건져냈는지**(2026-08-27 실측 실패 대응).
   * 건진 글은 tags·사진 순서가 비고 본문 끝이 잘렸을 수 있다.
   * 예전엔 여기서 그냥 던져서 **그 매장은 그날 글이 0건**이었다 —
   * 부분 성공으로 바꾸되, 조용히 넘기지 않고 저장·경보로 드러낸다.
   */
  salvaged: 'truncated' | 'unescaped-quote' | null;
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
  return { master, perChannel, channels, degraded: gemini.usedFallback(), salvaged: gemini.salvagedAs() };
}

/** 이미 생성된 마스터가 있을 때(재발행·수정) — Gemini 호출 없이 재포맷만 */
export function reformat(
  master: DraftOutput,
  channels: ChannelId[],
  images: MasterImage[] = [],
): ChannelDraftBundle {
  // Gemini를 새로 호출하지 않으므로 품질 강등·건지기가 발생할 여지가 없다
  return { master, perChannel: formatForChannels(master, channels, images), channels, degraded: false, salvaged: null };
}
