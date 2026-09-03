/**
 * 지금 이 서비스에 **누가 들어와 있는가** — 세션 시작 시 현재 상태 확인용.
 *
 * 기록(핸드오프 문서)이 아니라 DB를 본다. 문서는 낡고, 사장님은 문서에 안 적힌 채로 들어온다.
 *
 * 사용법: npx tsx src/who-is-in.ts
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const day = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : '-');

async function main() {
  const { data: stores } = await sb
    .from('stores')
    .select('id, name, industry_id, owner_id, created_at, onboarded_at, naver_place_url')
    .order('created_at');
  const { data: users } = await sb.auth.admin.listUsers();

  console.log(`매장 ${stores?.length ?? 0}곳\n`);
  for (const s of stores ?? []) {
    const u = users.users.find((x) => x.id === s.owner_id);
    const [{ count: posts }, { count: published }, { count: reviews }] = await Promise.all([
      sb.from('posts').select('id', { count: 'exact', head: true }).eq('store_id', s.id).neq('status', 'archived'),
      sb.from('posts').select('id', { count: 'exact', head: true }).eq('store_id', s.id).not('published_at', 'is', null),
      sb.from('reviews').select('id', { count: 'exact', head: true }).eq('store_id', s.id),
    ]);
    console.log(`■ ${s.name} (${s.industry_id})`);
    console.log(`   가입 ${day(s.created_at)} · 온보딩 ${day(s.onboarded_at)}`);
    console.log(`   계정 ${u?.email ?? '(없음)'} · 마지막 로그인 ${day(u?.last_sign_in_at)}`);
    console.log(`   초안 ${posts ?? 0} · 실제 발행 ${published ?? 0} · 리뷰 ${reviews ?? 0}`);
    console.log(`   플레이스 ${s.naver_place_url ? '연결됨' : '없음'}`);
    console.log();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
