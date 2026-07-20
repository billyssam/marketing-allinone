/**
 * industries 테이블을 사업 택소노미와 동기화(upsert).
 * stores.industry_id 가 industries(id) FK라, 온보딩이 45개 업종을 저장하려면
 * 먼저 여기 시드돼 있어야 한다. 택소노미 = 단일 원천 → 이 스크립트로 재동기화.
 *
 * 실행: cd backend && npx tsx src/seed-industries.ts
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BUSINESS_TYPES } from '../../shared/business/taxonomy.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ SUPABASE URL/SERVICE_ROLE_KEY 필요');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const rows = BUSINESS_TYPES.map((b) => ({
    id: b.id,
    name_ko: b.label,
    copywriting_rules: {
      group: b.group,
      offering: b.offering,
      preset: b.preset,
      saleModes: b.saleModes,
      keywords: b.keywords,
    },
  }));

  const { error } = await supabase.from('industries').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error('❌ upsert 실패:', error.message);
    process.exit(1);
  }
  console.log(`✅ industries ${rows.length}개 동기화 완료`);

  const { count } = await supabase.from('industries').select('id', { count: 'exact', head: true });
  console.log(`   현재 industries 총 ${count}개`);
}

main().catch((e) => {
  console.error('❌ 실행 실패:', e.message);
  process.exit(1);
});
