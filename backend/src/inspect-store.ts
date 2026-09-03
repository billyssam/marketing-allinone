/**
 * 한 매장을 **사장님 입장에서** 들여다본다 — 왜 안 돌아왔는지 찾을 때.
 *
 * 사용법: npx tsx src/inspect-store.ts <상호 일부>
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const q = process.argv[2];
if (!q) {
  console.error('사용법: npx tsx src/inspect-store.ts <상호 일부>');
  process.exit(1);
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function plain(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  const { data: stores } = await sb.from('stores').select('*').ilike('name', `%${q}%`);
  const s = stores?.[0];
  if (!s) { console.error(`"${q}" 매장 없음`); process.exit(1); }

  const { data: users } = await sb.auth.admin.listUsers();
  const u = users.users.find((x) => x.id === s.owner_id);
  const subs = ((u?.user_metadata as { push_subs?: unknown[] } | undefined)?.push_subs ?? []).length;

  console.log(`■ ${s.name} (${s.industry_id})`);
  console.log(`  계정 ${u?.email} · 가입 ${s.created_at?.slice(0, 10)} · 마지막 로그인 ${u?.last_sign_in_at?.slice(0, 10) ?? '-'}`);
  console.log(`  알림 구독 기기 ${subs}대 ${subs === 0 ? '← 아침 알림이 안 간다' : ''}`);
  console.log(`  주소 ${s.address || '(없음)'} · 플레이스 ${s.naver_place_url || '(없음)'}`);
  const tone = (s.brand_tone ?? {}) as { offerings?: { name: string; price?: number }[] };
  console.log(`  등록 상품 ${tone.offerings?.length ?? 0}종: ${(tone.offerings ?? []).map((o) => o.name).join(', ') || '(없음)'}`);

  const { data: conns } = await sb.from('channel_connections').select('channel_id, status').eq('store_id', s.id);
  console.log(`  연결 채널: ${(conns ?? []).map((c) => `${c.channel_id}(${c.status})`).join(' · ') || '(없음)'}`);

  const { data: posts } = await sb.from('posts')
    .select('channel, title, body_plain, body_html, status, created_at, published_at')
    .eq('store_id', s.id).neq('status', 'archived').order('created_at');
  console.log(`\n  초안 ${posts?.length ?? 0}건 (발행 ${(posts ?? []).filter((p) => p.published_at).length}건)\n`);
  for (const p of posts ?? []) {
    const body = plain((p.body_plain as string) || (p.body_html as string) || '');
    console.log('─'.repeat(70));
    console.log(`[${p.channel}] ${p.title ?? '(제목 없는 채널)'}  ${p.created_at.slice(0, 10)} ${p.published_at ? '· 발행됨' : ''}`);
    console.log(body.slice(0, 700));
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
