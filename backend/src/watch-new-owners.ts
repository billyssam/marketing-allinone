/**
 * 새 사장님이 들어오면 **그날 안에 안다.**
 *
 * 왜 필요한가: 실사용자 `본디`가 2026-08-26에 가입했는데, 우리가 그 사실을 안 건 **9월 3일**이었다.
 * 그동안 초안은 매일 만들어졌지만 아무도 그분을 챙기지 않았고, 그분은 가입한 날 이후로 안 왔다.
 * 첫 주에 말 한마디 없으면 파일럿은 그냥 조용히 끝난다.
 *
 * 또 하나: **떠나는 것도 감지한다.** 온보딩까지 마친 사장님이 7일 넘게 안 들어오면
 * 그건 "잘 쓰고 있다"가 아니라 이탈 신호다.
 *
 * ⚠️ 저장소가 공개라 **상호·이메일은 절대 공개 채널로 내보내지 않는다.**
 * 공개 로그·이슈에는 "몇 명"만, 상세는 운영자 텔레그램(비공개)으로.
 *
 * 사용법: npx tsx src/watch-new-owners.ts
 * 종료코드: 알릴 것이 있으면 0(정상) — 실패로 처리하지 않는다. 조회 자체가 실패하면 1.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { storeLabel } from './mask.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const DAY = 86_400_000;

/** 우리가 만든 계정(시뮬·검증·리허설)은 사장님이 아니다 */
function isOurs(email?: string | null, storeName?: string | null): boolean {
  const e = email ?? '';
  const s = storeName ?? '';
  return (
    !e ||
    e.includes('sim-') ||
    e.includes('example.com') ||
    e.startsWith('rehearsal-') ||
    e.startsWith('reply-test') ||
    e.startsWith('regulars-test') ||
    e.startsWith('dash-test') ||
    /시뮬|검증/.test(s)
  );
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return res.ok;
}

async function main() {
  const { data: stores, error } = await sb
    .from('stores')
    .select('id, name, industry_id, owner_id, created_at, onboarded_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('stores 조회 실패:', error.message);
    process.exit(1);
  }
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const userById = new Map(users.users.map((u) => [u.id, u]));

  const real = (stores ?? []).filter((s) => !isOurs(userById.get(s.owner_id as string)?.email, s.name as string));

  const now = Date.now();
  const newcomers = real.filter((s) => now - Date.parse(s.created_at as string) < DAY);
  const quiet = real.filter((s) => {
    const u = userById.get(s.owner_id as string);
    if (!u?.last_sign_in_at || !s.onboarded_at) return false;
    const since = now - Date.parse(u.last_sign_in_at);
    return since > 7 * DAY;
  });

  console.log(`실사용 매장 ${real.length}곳 · 오늘 새로 온 분 ${newcomers.length} · 7일 넘게 안 온 분 ${quiet.length}`);
  // 공개 로그에는 별칭만 — 상호는 여기 찍으면 인터넷에 남는다
  for (const s of newcomers) console.log(`  🎉 신규: ${storeLabel(s)} (${s.industry_id})`);
  for (const s of quiet) {
    const u = userById.get(s.owner_id as string);
    const days = Math.floor((now - Date.parse(u!.last_sign_in_at as string)) / DAY);
    console.log(`  ⚠️ 조용함: ${storeLabel(s)} — ${days}일째 안 들어옴`);
  }

  // 상세(상호·이메일)는 비공개 채널로만
  if (newcomers.length || quiet.length) {
    const lines: string[] = [];
    if (newcomers.length) {
      lines.push(`🎉 <b>새 사장님 ${newcomers.length}분</b>이 가입했어요`);
      for (const s of newcomers) {
        const u = userById.get(s.owner_id as string);
        lines.push(`· ${s.name} (${s.industry_id}) — ${u?.email}`);
      }
      lines.push('', '첫 주에 말 한 번 거는 게 이 파일럿의 전부입니다.');
    }
    if (quiet.length) {
      if (lines.length) lines.push('');
      lines.push(`⚠️ <b>${quiet.length}분</b>이 일주일 넘게 안 들어왔어요`);
      for (const s of quiet) {
        const u = userById.get(s.owner_id as string);
        const days = Math.floor((now - Date.parse(u!.last_sign_in_at as string)) / DAY);
        lines.push(`· ${s.name} — ${days}일째 · ${u?.email}`);
      }
    }
    const sent = await sendTelegram(lines.join('\n'));
    console.log(sent ? '상세는 운영자 텔레그램으로 보냈습니다.' : '⚠️ 텔레그램 미설정 — 상세는 `npx tsx src/who-is-in.ts`로 확인하세요.');
  }

  // 워크플로가 이슈를 띄울지 결정할 수 있게 파일로 남긴다(공개 안전 문구만)
  const summaryFile = process.env.OWNER_WATCH_SUMMARY_FILE;
  if (summaryFile && (newcomers.length || quiet.length)) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      summaryFile,
      [
        newcomers.length ? `새로 가입한 사장님 ${newcomers.length}분` : '',
        quiet.length ? `일주일 넘게 안 들어온 사장님 ${quiet.length}분` : '',
      ].filter(Boolean).join('\n'),
      'utf8',
    );
  }
}

main().catch((e) => {
  console.error('감시 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
