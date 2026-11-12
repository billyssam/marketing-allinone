import { Hono } from 'hono';
import { implementedChannels } from '../channels/index.js';
import { CHANNELS } from '../../../shared/channels/registry.js';

export const channelsRoute = new Hono();

/** 전 채널 카탈로그 (구현 여부 표시) */
channelsRoute.get('/', (c) => {
  const impl = new Set(implementedChannels());
  return c.json(
    CHANNELS.map((ch) => ({
      id: ch.id,
      name: ch.name,
      group: ch.group,
      automation: ch.automation,
      status: ch.status,
      implemented: impl.has(ch.id),
      actions: ch.actions,
    })),
  );
});

// Legacy routes accepted caller-supplied store IDs and provider credentials.
// No application client uses them. Keep the catalog public, retire mutations;
// authenticated web OAuth routes own connection state and tenant authorization.
channelsRoute.post('/:id/connect', (c) => c.json({ error: '웹앱의 채널 연결 화면을 이용해주세요.' }, 410));
channelsRoute.post('/:id/publish', (c) => c.json({ error: '이 게시 API는 더 이상 제공하지 않습니다. 웹앱의 게시 도우미를 이용해주세요.' }, 410));
