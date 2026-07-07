import type { DraftContent, Connection, PublishResult } from '../../shared/channels/adapter.js';
import type { ChannelId } from '../../shared/channels/registry.js';
import { getAdapter } from './channels/index.js';

/**
 * 발행 오케스트레이터 — 채널별 DraftContent를 각 어댑터로 라우팅.
 * auto 채널 = 서버 발행 시도 / assisted 채널 = 핸드오프(딥링크+클립보드) 준비.
 * 연결 안 된 채널은 실패로 표기(전체 중단 X).
 */
export interface ChannelPublishOutcome {
  channelId: ChannelId;
  result: PublishResult | null;
  error?: string;
}

export async function publishToChannels(
  perChannel: Record<string, DraftContent>,
  connections: Partial<Record<ChannelId, Connection>>,
): Promise<ChannelPublishOutcome[]> {
  const entries = Object.entries(perChannel) as [ChannelId, DraftContent][];
  return Promise.all(
    entries.map(async ([channelId, draft]) => {
      const adapter = getAdapter(channelId);
      if (!adapter) return { channelId, result: null, error: '어댑터 미구현' };
      const conn = connections[channelId];
      if (!conn) return { channelId, result: null, error: '채널 미연결' };
      try {
        const result = await adapter.publish(conn, draft);
        return { channelId, result };
      } catch (e) {
        return { channelId, result: null, error: (e as Error).message };
      }
    }),
  );
}

/** assisted 채널만 뽑아 카톡봇 핸드오프 페이로드 구성 */
export function collectHandoffs(outcomes: ChannelPublishOutcome[]) {
  return outcomes
    .filter((o) => o.result?.mode === 'assisted' && o.result.handoff)
    .map((o) => ({ channelId: o.channelId, handoff: o.result!.handoff! }));
}
