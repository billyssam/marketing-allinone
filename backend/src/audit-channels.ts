/**
 * 채널이 **정말로 연결되는가** 실측.
 *
 * 왜: 레지스트리에 27개가 있고 12개가 `status: 'live'`로 적혀 있다. 그런데 '있다'는 건
 * **정의가 있다**는 뜻이지 **사장님이 연결할 수 있다**는 뜻이 아니다.
 * "27개 서비스인데 받을 게 없이 자동으로 된다고?"라는 질문에 정직하게 답하려면
 * 연결 경로가 코드에 실존하는지, DB에 실제 토큰이 있는지를 세야 한다.
 *
 * 사용법: npx tsx src/audit-channels.ts
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { CHANNELS, CONTENT_CHANNELS, type ChannelId } from '../../shared/channels/registry.js';
import { oauthConfigOf } from '../../shared/channels/oauth-config.js';
import { KEY_CHANNELS, canVerifyKey } from '../../shared/channels/readiness.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** 연결 방식별로 **무엇이 있어야 실제로 되는지** */
function pathExists(connect: string, id: string): { ok: boolean; why: string } {
  const oauth = oauthConfigOf(id);
  if (oauth) {
    const route = resolve(process.cwd(), '../web/src/app/api/connect/[channel]/callback/route.ts');
    const configured = Boolean(process.env[oauth.clientIdEnv] && process.env[oauth.clientSecretEnv]);
    const has = existsSync(route);
    return { ok: has, why: has ? `공용 OAuth 콜백 있음 · 로컬 운영 설정 ${configured ? '존재(외부 인증 별도)' : '미준비'}` : '공용 OAuth 콜백 없음' };
  }
  if (CONTENT_CHANNELS.includes(id as ChannelId)) {
    const has = existsSync(resolve(process.cwd(), '../web/src/app/prepare/page.tsx'));
    return { ok: has, why: has ? '초안·직접 게시 보조 경로 있음 · 외부 게시 별도 검증' : '게시 보조 화면 없음' };
  }
  switch (connect) {
    case 'extension': {
      // 브라우저 확장 없이는 '반자동 붙여넣기'조차 안내뿐이다
      const has = existsSync(resolve(process.cwd(), '../extension')) ||
        existsSync(resolve(process.cwd(), '../browser-extension'));
      return { ok: has, why: has ? '확장 폴더 있음' : '확장 프로그램이 저장소에 없음' };
    }
    case 'oauth': {
      return { ok: false, why: '해당 채널 OAuth 설정 미구현' };
    }
    case 'apikey': {
      const has = KEY_CHANNELS.some((c) => c.id === id) && existsSync(resolve(process.cwd(), '../web/src/app/channels/actions.ts'));
      return { ok: has, why: has ? `키 저장 화면 있음 · 외부 키 검증 ${canVerifyKey(id) ? '지원(실제 키 별도)' : '미지원'}` : '해당 채널 키 입력 경로 없음' };
    }
    case 'manual':
      return { ok: true, why: '연결 개념 없음(직접 붙여넣기)' };
    case 'crawl':
      return { ok: true, why: '크롤(자격증명 불필요)' };
    default:
      return { ok: false, why: '알 수 없음' };
  }
}

async function main() {
  const { data: conns, error: connectionsError } = await sb.from('channel_connections').select('channel_id, status, access_token');
  if (connectionsError) throw new Error(`채널 조회 실패: ${connectionsError.code}`);
  const byChannel = new Map<string, { total: number; connected: number; withToken: number }>();
  for (const c of conns ?? []) {
    const k = c.channel_id as string;
    const cur = byChannel.get(k) ?? { total: 0, connected: 0, withToken: 0 };
    cur.total++;
    if (c.status === 'connected') cur.connected++;
    if (c.access_token) cur.withToken++;
    byChannel.set(k, cur);
  }

  const live = CHANNELS.filter((c) => c.status !== 'planned');
  console.log(`레지스트리 ${CHANNELS.length}개 · 계획 단계 제외 ${live.length}개\n`);
  console.log('채널'.padEnd(16) + '연결방식'.padEnd(11) + '경로'.padEnd(6) + 'DB연결'.padEnd(8) + '실토큰');
  console.log('─'.repeat(62));

  let pathOk = 0, anyToken = 0;
  for (const c of live) {
    const p = pathExists(c.connect, c.id);
    const d = byChannel.get(c.id) ?? { total: 0, connected: 0, withToken: 0 };
    if (p.ok) pathOk++;
    if (d.withToken > 0) anyToken++;
    console.log(
      c.name.padEnd(16) +
      c.connect.padEnd(11) +
      (p.ok ? '  ○  ' : '  ✕  ').padEnd(6) +
      `${d.connected}/${d.total}`.padEnd(8) +
      String(d.withToken) +
      `   ← ${p.why}`,
    );
  }

  console.log('\n' + '─'.repeat(62));
  console.log(`코드 경로가 있는 채널: ${pathOk}/${live.length} (실제 외부 작동 검증과 다름)`);
  console.log(`저장 토큰이 있는 채널: ${anyToken}/${live.length} (유효성·권한·게시 성공은 별도 확인)`);
  const { count: published, error: postsError } = await sb.from('posts')
    .select('id', { count: 'exact', head: true }).not('external_url', 'is', null);
  if (postsError) throw new Error(`게시 기록 조회 실패: ${postsError.code}`);
  console.log(`외부 URL이 기록된 글: ${published ?? 0}건 (소유자 확인 기록이며 실제 노출 증거 아님)`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
