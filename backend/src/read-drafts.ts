/**
 * 오늘 초안 정독 — **사람 눈으로 읽기 위한** 덤프.
 *
 * 왜 필요한가: 테스트·크론·품질점검이 전부 초록불이어도 결함은 남는다.
 * 실제로 8월에 "동절기 영업" 발행, 사장님이 자기 가게를 3인칭으로 추천,
 * 답글 8건 동일 — 자동 점검은 **내가 미리 생각한 실패**만 잡는다.
 * 파일럿에 사장님을 넣기 전엔 사람이 전문을 읽어야 한다.
 *
 * 사용법: npx tsx src/read-drafts.ts [--days=1]
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 1);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: posts }, { data: stores }] = await Promise.all([
    supabase
      .from('posts')
      // ⚠️ body_html만 읽으면 안 된다 — 블로그만 html이고 **숏폼은 body_plain**이다.
      // 실측(2026-08-24): html만 읽었더니 12건 중 10건이 "본문 0자"로 보여
      //   대형 결함으로 오인했다. 제목이 null인 것도 정상 — 인스타 캡션엔 제목 칸이 없다.
      .select('channel, title, body_html, body_plain, created_at, store_id, metadata, status')
      .gte('created_at', since)
      .neq('status', 'archived')
      .order('store_id')
      .order('channel'),
    supabase.from('stores').select('id, name'),
  ]);
  const nameOf = new Map((stores ?? []).map((s) => [s.id as string, s.name as string]));

  console.log(`최근 ${days}일 초안 ${posts?.length ?? 0}건\n`);
  let empty = 0;
  for (const p of posts ?? []) {
    const raw = ((p.body_plain as string) ?? '') || ((p.body_html as string) ?? '');
    const body = plain(raw);
    if (!body) empty++;
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    console.log('━'.repeat(72));
    console.log(`[${nameOf.get(p.store_id as string)} · ${p.channel}] ${p.title ?? '(제목 없는 채널)'}`);
    console.log(`  (${body.length}자 · ${meta.angle ?? '-'} · ${meta.titleStyle ?? '-'})`);
    console.log('─'.repeat(72));
    console.log(body);
    console.log();
  }
  // 본문이 진짜 빈 건은 결함이다 — 정독하다 놓치지 않게 끝에서 한 번 더 세어 준다
  if (empty) console.log(`\n⛔ 본문이 빈 초안 ${empty}건 — 생성이 반쪽으로 끝났다는 뜻이다.`);
}

main().catch((e) => {
  console.error('읽기 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
