/**
 * 매장 데이터 리셋 (파일럿 전 demo 정리용) — 안전 3원칙:
 *   1. 기본은 드라이런: 인자 없으면 현황만 보여주고 아무것도 안 지운다.
 *   2. 백업 없이 삭제 없음: 삭제 전 전체 데이터를 JSON으로 로컬 백업.
 *   3. --yes 없이 삭제 없음.
 *
 * 사용법:
 *   npx tsx src/reset-store-data.ts                          # 현황(드라이런, demo 매장)
 *   npx tsx src/reset-store-data.ts --store="쿵더쿵"          # 대상 매장 지정
 *   npx tsx src/reset-store-data.ts --wipe-posts --yes       # 글·활동만 정리(리뷰·단골·설정 유지)
 *   npx tsx src/reset-store-data.ts --full --yes             # 자식 데이터 전체 정리(매장·계정은 유지)
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const STORE_NAME = args.find((a) => a.startsWith('--store='))?.split('=')[1] ?? '쿵더쿵';
const WIPE_POSTS = args.includes('--wipe-posts');
const FULL = args.includes('--full');
const YES = args.includes('--yes');

// 자식 테이블 (store_id FK). --wipe-posts는 앞 2개만.
const POST_TABLES = ['posts', 'activity_log'] as const;
const FULL_TABLES = ['posts', 'activity_log', 'reviews', 'regulars', 'channel_connections'] as const;

async function main() {
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, name, owner_id, created_at')
    .eq('name', STORE_NAME)
    .maybeSingle();
  if (error) throw error;
  if (!store) {
    console.error(`매장 "${STORE_NAME}" 없음`);
    process.exit(1);
  }

  // 현황
  console.log(`대상: ${store.name} (${store.id})`);
  const counts: Record<string, number> = {};
  for (const t of FULL_TABLES) {
    const { count } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('store_id', store.id);
    counts[t] = count ?? 0;
    console.log(`  ${t}: ${count ?? 0}`);
  }

  const mode = FULL ? 'full' : WIPE_POSTS ? 'wipe-posts' : null;
  if (!mode) {
    console.log('\n드라이런 — 아무것도 지우지 않았습니다. 삭제하려면 --wipe-posts 또는 --full에 --yes를 함께.');
    return;
  }
  if (!YES) {
    console.log(`\n--${mode === 'full' ? 'full' : 'wipe-posts'} 지정됐지만 --yes가 없어 중단(안전).`);
    return;
  }

  // 1) 백업 (삭제 전 전체 덤프)
  const tables = mode === 'full' ? FULL_TABLES : POST_TABLES;
  const backup: Record<string, unknown> = { store, exportedAt: new Date().toISOString(), mode };
  for (const t of tables) {
    const { data, error: e } = await supabase.from(t).select('*').eq('store_id', store.id);
    if (e) throw new Error(`${t} 백업 실패: ${e.message} — 삭제 중단`);
    backup[t] = data ?? [];
  }
  const dir = resolve(process.cwd(), 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const file = resolve(dir, `reset-${STORE_NAME}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\n🗂  백업 완료: ${file}`);

  // 2) 삭제
  for (const t of tables) {
    const { error: e } = await supabase.from(t).delete().eq('store_id', store.id);
    if (e) throw new Error(`${t} 삭제 실패: ${e.message}`);
    console.log(`  ${t}: ${counts[t]}건 삭제`);
  }
  console.log(`\n✅ ${mode === 'full' ? '전체' : '글·활동'} 정리 완료 — 매장 설정·계정은 그대로입니다.`);
}

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});
