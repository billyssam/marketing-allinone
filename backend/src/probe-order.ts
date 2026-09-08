import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const { data: store } = await sb.from('stores').select('id').eq('name', '답글검증 A').maybeSingle();
  if (!store) { console.log('매장 없음 — --keep 으로 먼저 만들어 둘 것'); return; }

  for (const asc of [true, false]) {
    const { data: d } = await sb.from('reviews').select('sentiment')
      .eq('store_id', store.id).order('sentiment', { ascending: asc }).limit(3);
    console.log(`  sentiment ${asc ? '오름차순' : '내림차순'} 앞 3건: ${(d ?? []).map((r) => r.sentiment).join(', ')}`);
  }

  const { data, error } = await sb
    .from('reviews')
    .select('author_display, sentiment, reply_sent_at')
    .eq('store_id', store.id)
    .order('reply_sent_at', { ascending: true, nullsFirst: true })
    .order('sentiment', { ascending: true })
    .order('posted_at', { ascending: false })
    .limit(100);
  if (error) { console.log('쿼리 오류:', error.message); return; }

  const negs = (data ?? []).filter((r) => r.sentiment === 'negative');
  const { count: negTotal } = await sb.from('reviews')
    .select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('sentiment', 'negative');

  console.log(`실려온 100건 중 부정 ${negs.length} / 전체 부정 ${negTotal}`);
  console.log(`앞 5건: ${(data ?? []).slice(0, 5).map((r) => `${r.author_display}(${r.sentiment})`).join(' · ')}`);
  console.log(`손님001 포함? ${(data ?? []).some((r) => r.author_display === '손님001') ? 'O' : 'X'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
