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
import webpush from 'web-push';
import { contentChannelsFor } from '../../shared/channels/registry';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const DRY = process.argv.includes('--dry');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com';
const APP = process.env.PILOT_APP_URL ?? 'https://marketing-allinone.vercel.app';

if (!url || !key) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!PUB || !PRIV) {
  // 조용히 성공하면 "알림이 왜 안 오지"를 아무도 못 찾는다 — 명시적으로 실패시킨다
  console.error('env 누락: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)');
  process.exit(1);
}
webpush.setVapidDetails(SUBJECT, PUB, PRIV);

const supabase = createClient(url, key, { auth: { persistSession: false } });

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const kstTodayStart = () => new Date(Math.floor((Date.now() + KST) / DAY) * DAY - KST).toISOString();

interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

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
      console.log(`[${s.name}] 오늘 초안 없음 → 알림 안 보냄`);
      skipped++;
      continue;
    }

    const { data: userRes } = await supabase.auth.admin.getUserById(s.owner_id as string);
    const subs = (userRes?.user?.user_metadata?.push_subs ?? []) as PushSub[];
    if (!subs.length) {
      console.log(`[${s.name}] 구독 기기 없음(알림 미설정)`);
      skipped++;
      continue;
    }

    const n = contentChannelsFor(todays.map((p) => p.channel as string)).length || todays.length;
    const payload = JSON.stringify({
      title: `${s.name} · 오늘 글 준비됐어요`,
      // 개수를 앞세우지 않는다 — "하나만 하면 된다"는 약속과 어긋난다
      body: `${n}개 채널에 맞춰 써뒀어요. 하나만 골라 올리면 끝이에요.`,
      tag: 'daily',
      url: `${APP}/dashboard`,
    });

    for (const sub of subs) {
      if (DRY) {
        console.log(`[${s.name}] (dry) → ${sub.endpoint.slice(0, 48)}…`);
        sent++;
        continue;
      }
      try {
        await webpush.sendNotification(sub as unknown as webpush.PushSubscription, payload);
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410 = 구독이 죽음(앱 삭제·브라우저 초기화). 지워두지 않으면 매일 실패로 쌓인다.
        if (status === 404 || status === 410) {
          const left = subs.filter((x) => x.endpoint !== sub.endpoint);
          await supabase.auth.admin.updateUserById(s.owner_id as string, {
            user_metadata: { ...(userRes?.user?.user_metadata ?? {}), push_subs: left },
          });
          console.log(`[${s.name}] 만료된 구독 정리(${status})`);
          gone++;
        } else {
          console.warn(`[${s.name}] 발송 실패(${status ?? '?'}): ${(e as Error).message?.slice(0, 100)}`);
          failed++;
        }
      }
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
