import { Hono } from 'hono';
import { getAdapter, implementedChannels } from '../channels/index.js';
import { CHANNELS } from '../../../shared/channels/registry.js';
import type { ChannelId } from '../../../shared/channels/registry.js';
import type { Connection, DraftContent, StoreContext } from '../../../shared/channels/adapter.js';

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

/** 채널 연결 */
channelsRoute.post('/:id/connect', async (c) => {
  const id = c.req.param('id') as ChannelId;
  const adapter = getAdapter(id);
  if (!adapter) return c.json({ error: `${id} 어댑터 미구현` }, 404);
  const body = await c.req.json<{ store: StoreContext; credentials?: Record<string, string> }>();
  const conn = await adapter.connect(body.store, body.credentials);
  return c.json(conn);
});

/** 채널 발행 (auto=서버발행 / assisted=핸드오프) */
channelsRoute.post('/:id/publish', async (c) => {
  const id = c.req.param('id') as ChannelId;
  const adapter = getAdapter(id);
  if (!adapter) return c.json({ error: `${id} 어댑터 미구현` }, 404);
  const body = await c.req.json<{ conn: Connection; draft: DraftContent }>();
  const result = await adapter.publish(body.conn, body.draft);
  return c.json(result);
});
