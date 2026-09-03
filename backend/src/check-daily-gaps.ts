/**
 * 매장별로 **초안이 없는 날**을 찾는다.
 *
 * 왜 있는 것을 세지 않고 없는 것을 찾는가: 남아 있는 초안만 세면
 * "통째로 빠진 날"이 통과로 찍힌다. 사장님은 글이 온 날이 아니라 **안 온 날**에 떠난다.
 *
 * 사용법: npx tsx src/check-daily-gaps.ts [--days=14]
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 14);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
/** UTC 타임스탬프를 KST 날짜(YYYY-MM-DD)로 — 크론이 KST 기준으로 도니 판정도 KST여야 한다 */
const kstDate = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);

async function main() {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const { data: stores } = await sb.from('stores').select('id, name, onboarded_at').not('onboarded_at', 'is', null);

  for (const s of stores ?? []) {
    // 보관분도 센다 — 재생성으로 보관된 날은 "글이 있었던 날"이다
    const { data: posts } = await sb.from('posts')
      .select('created_at, status').eq('store_id', s.id).gte('created_at', since);
    const have = new Set((posts ?? []).map((p) => kstDate(p.created_at as string)));

    const start = Math.max(Date.parse(s.onboarded_at as string), Date.now() - days * DAY);
    const missing: string[] = [];
    for (let t = start; t < Date.now(); t += DAY) {
      const d = new Date(t + KST).toISOString().slice(0, 10);
      // 오늘은 아직 생성 전일 수 있으니 뺀다
      if (d === new Date(Date.now() + KST).toISOString().slice(0, 10)) continue;
      if (!have.has(d)) missing.push(d);
    }

    const span = Math.ceil((Date.now() - start) / DAY);
    console.log(`■ ${s.name} — 가능한 ${span}일 중 글 있는 날 ${have.size}일`);
    if (missing.length) console.log(`   ⛔ 빠진 날 ${missing.length}일: ${missing.join(', ')}`);
    else console.log('   ✅ 빠진 날 없음');
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
