/**
 * 진행률 실측 — **"몇 %?"에 하나의 숫자로 답하지 않기 위해.**
 *
 * 축이 다른 것을 한 숫자로 뭉개면 거짓말이 섞인다.
 * "만들기 90%"와 "실사용 0%"는 둘 다 사실이고, 평균 45%는 아무 뜻도 없다.
 * 그래서 축별로 **센 근거와 함께** 뽑는다.
 *
 * 사용법: npx tsx src/progress-audit.ts
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { CHANNELS } from '../../shared/channels/registry.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

async function main() {
  // ── 채널: 계획(automation)과 현실(status)을 반드시 합쳐서 센다 ──
  const live = CHANNELS.filter((c) => c.status !== 'planned');
  const planned = CHANNELS.filter((c) => c.status === 'planned');
  console.log('■ 채널 (계획 vs 현실)');
  console.log(`   전체 ${CHANNELS.length} · 쓸 수 있음 ${live.length} · 준비중 ${planned.length}  → ${pct(live.length, CHANNELS.length)}`);
  console.log(`   준비중: ${planned.map((c) => c.name).join(', ')}`);

  // ── 실제 사용: 만든 것이 아니라 쓰인 것 ──
  const [stores, posts, published, reviews, replied, conns, connected] = await Promise.all([
    sb.from('stores').select('id', { count: 'exact', head: true }).not('onboarded_at', 'is', null),
    sb.from('posts').select('id', { count: 'exact', head: true }).neq('status', 'archived'),
    sb.from('posts').select('id', { count: 'exact', head: true }).not('published_at', 'is', null),
    sb.from('reviews').select('id', { count: 'exact', head: true }),
    sb.from('reviews').select('id', { count: 'exact', head: true }).not('reply_sent_at', 'is', null),
    sb.from('channel_connections').select('id', { count: 'exact', head: true }),
    sb.from('channel_connections').select('id', { count: 'exact', head: true }).eq('status', 'connected'),
  ]);

  console.log('\n■ 실제 사용 (만든 것 말고 쓰인 것)');
  console.log(`   매장 ${stores.count ?? 0}곳 · 초안 ${posts.count ?? 0}건`);
  console.log(`   실제 발행 ${published.count ?? 0}건  → 초안 대비 ${pct(published.count ?? 0, posts.count ?? 0)}`);
  console.log(`   리뷰 ${reviews.count ?? 0}건 · 답글 보냄 ${replied.count ?? 0}건  → ${pct(replied.count ?? 0, reviews.count ?? 0)}`);
  console.log(`   채널 연결 시도 ${conns.count ?? 0}건 · 실제 연결됨 ${connected.count ?? 0}건  ← 토큰이 있는 연결`);

  // ── 사장님께 닿는 경로: 알림 구독이 없으면 매일 만든 글이 아무 데도 안 간다 ──
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  // 시뮬 계정과 우리가 만든 리허설 계정은 실사용이 아니다 — 섞으면 숫자가 거짓말을 한다.
  // (rehearsal-hair@gmail.com = 미용실 리허설용으로 우리가 만든 것)
  const isOurs = (e?: string) =>
    !e || e.includes('sim-') || e.includes('example.com') || e.startsWith('rehearsal-');
  const owners = users.users.filter((u) => !isOurs(u.email));
  const subscribed = owners.filter(
    (u) => (((u.user_metadata as { push_subs?: unknown[] } | undefined)?.push_subs ?? []).length > 0),
  );
  const returned = owners.filter(
    (u) => u.last_sign_in_at && u.created_at &&
      Date.parse(u.last_sign_in_at) - Date.parse(u.created_at) > 86_400_000,
  );
  console.log('\n■ 사장님께 닿는가 (이 제품의 병목)');
  console.log(`   실사용 계정 ${owners.length}명`);
  console.log(`   알림 구독 ${subscribed.length}명  → ${pct(subscribed.length, owners.length)}  ← 0이면 매일 만든 글이 아무 데도 안 간다`);
  console.log(`   가입 다음날 이후 재방문 ${returned.length}명  → ${pct(returned.length, owners.length)}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
