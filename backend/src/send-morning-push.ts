/**
 * 아침 알림 발송 — "오늘 글 준비됐어요"를 사장님 폰으로.
 *
 * 왜 필요한가: 매일 아침 8채널 글이 준비돼도 **사장님이 앱을 열어야만** 안다.
 * 열지 않으면 그날 글은 그냥 지나간다. 실제로 주간 리포트가 "올린 날 0/7"인데,
 * 글이 나빠서가 아니라 **아무도 부르지 않아서**일 가능성이 크다.
 *
 * 왜 카톡이 아니라 웹 푸시인가: 알림톡은 사업자 등록 + 템플릿 심사 2주 + 건당 8~15원이고,
 * 친구톡·챗봇은 카카오 비즈니스 채널 개설이 선행이라 **지금 동작 확인이 불가능**하다.
 * 웹 푸시는 VAPID 자체 발급이라 무료·심사 없음. 채널이 열리면 그때 알림톡을 얹으면 된다.
 *
 * 사용법: npx tsx src/send-morning-push.ts [--dry]
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { contentChannelsFor } from '../../shared/channels/registry';
// 발송·만료정리 규칙은 공용 모듈 하나만 쓴다 — 두 벌이면 한쪽만 고쳐지고 다른 쪽이 낡는다
import { configurePush, pushToOwner } from './push.js';
import { storeLabel } from './mask.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const DRY = process.argv.includes('--dry');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.PILOT_APP_URL ?? 'https://marketing-allinone.vercel.app';

if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!configurePush()) {
  // 조용히 성공하면 "알림이 왜 안 오지"를 아무도 못 찾는다 — 명시적으로 실패시킨다
  console.error('env 누락: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const kstTodayStart = () => new Date(Math.floor((Date.now() + KST) / DAY) * DAY - KST).toISOString();

async function main() {
  const todayStart = kstTodayStart();
  const { data: stores, error } = await supabase.from('stores').select('id, name, owner_id').not('onboarded_at', 'is', null);
  if (error) {
    console.error('❌ stores 조회 실패:', error.message);
    process.exit(1);
  }
  if (!stores?.length) {
    console.log('대상 매장 없음. 종료.');
    return;
  }

  let sent = 0, skipped = 0, gone = 0, failed = 0;

  for (const s of stores) {
    // 오늘 초안이 실제로 있을 때만 부른다 — 없는데 부르면 사장님이 헛걸음한다
    const { data: todays } = await supabase
      .from('posts')
      .select('channel')
      .eq('store_id', s.id)
      .gte('created_at', todayStart)
      .eq('status', 'draft')
      .contains('metadata', { auto: 'daily' });
    if (!todays?.length) {
      console.log(`[${storeLabel(s)}] 오늘 초안 없음 → 알림 안 보냄`);
      skipped++;
      continue;
    }

    const n = contentChannelsFor(todays.map((p) => p.channel as string)).length || todays.length;
    if (DRY) {
      console.log(`[${storeLabel(s)}] (dry) 채널 ${n}개 알림 대상`);
      sent++;
      continue;
    }

    const res = await pushToOwner(supabase, s.owner_id as string, {
      title: `${s.name} · 오늘 글 준비됐어요`,
      // 개수를 앞세우지 않는다 — "하나만 하면 된다"는 약속과 어긋난다
      body: `${n}개 채널에 맞춰 써뒀어요. 하나만 골라 올리면 끝이에요.`,
      tag: 'daily',
      url: `${APP}/dashboard`,
    });
    sent += res.sent;
    gone += res.gone;
    failed += res.failed;
    if (res.sent === 0 && res.failed === 0 && res.gone === 0) {
      console.log(`[${storeLabel(s)}] 구독 기기 없음(알림 미설정)`);
      skipped++;
    } else {
      console.log(`[${storeLabel(s)}] 발송 ${res.sent}${res.gone ? ` · 만료정리 ${res.gone}` : ''}${res.failed ? ` · 실패 ${res.failed}` : ''}`);
    }
  }

  console.log(`\n완료 — 발송 ${sent} · 스킵 ${skipped} · 만료정리 ${gone} · 실패 ${failed}`);
  // 실패는 알림으로 올린다(조용한 실패 금지). 구독 없음·초안 없음은 정상 상태다.
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('발송 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
