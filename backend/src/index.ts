import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', logger());
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const VERCEL_RE = /^https:\/\/.+\.vercel\.app$/;
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    return origin === WEB_ORIGIN || VERCEL_RE.test(origin) ? origin : null;
  },
  credentials: true,
}));

import { channelsRoute } from './routes/channels.js';

app.get('/', (c) => c.text('마케팅올인원 API 서버 v0.1'));
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));
app.route('/channels', channelsRoute);

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`🚀 marketing-all-in-one backend on http://localhost:${port}`);
});
