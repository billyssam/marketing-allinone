/**
 * "이 서비스가 실제로 뭘 해주는가" 실측.
 *
 * 왜: 레지스트리 27개, 랜딩의 "완전 자동" 같은 말은 **정의**지 **실적**이 아니다.
 * 사장님께 나열할 목록은 코드와 DB에서 뽑아야 한다.
 *
 * 사용법: npx tsx src/audit-services.ts
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { CHANNEL_BRIEF } from '../../shared/content-engine/channel-native.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const briefs = Object.keys(CHANNEL_BRIEF ?? {});
  console.log(`■ 글이 채널별로 재작성되는 채널: ${briefs.length}개`);
  console.log(`   ${briefs.join(', ')}\n`);

  // 실제로 DB에 쌓인 글의 채널 분포 = "진짜 만들어지는 것"
  const { data: posts } = await sb.from('posts').select('channel, status').limit(2000);
  const byCh = new Map<string, { total: number; live: number }>();
  for (const p of posts ?? []) {
    const k = p.channel as string;
    const cur = byCh.get(k) ?? { total: 0, live: 0 };
    cur.total++;
    if (p.status !== 'archived' && p.status !== 'failed') cur.live++;
    byCh.set(k, cur);
  }
  console.log('■ 실제로 만들어진 글 (DB 전수)');
  for (const [ch, v] of [...byCh.entries()].sort((a, b) => b[1].live - a[1].live)) {
    console.log(`   ${ch.padEnd(16)} ${String(v.live).padStart(4)}건`);
  }

  const [{ count: reviews }, { count: replied }, { count: regulars }, { count: published }] = await Promise.all([
    sb.from('reviews').select('id', { count: 'exact', head: true }),
    sb.from('reviews').select('id', { count: 'exact', head: true }).not('reply_draft', 'is', null),
    sb.from('regulars').select('id', { count: 'exact', head: true }),
    sb.from('posts').select('id', { count: 'exact', head: true }).not('published_at', 'is', null),
  ]);
  console.log('\n■ 글 말고 하는 일');
  console.log(`   리뷰 수집        ${reviews ?? 0}건`);
  console.log(`   AI 답글 초안     ${replied ?? 0}건  ← 수집한 리뷰마다 자동 작성`);
  console.log(`   단골 관리        ${regulars ?? 0}명`);
  console.log(`   사장님이 발행표시 ${published ?? 0}건`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
