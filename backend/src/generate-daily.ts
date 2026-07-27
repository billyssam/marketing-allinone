/**
 * 데일리 콘텐츠 크론 — "매일 아침 9시, 마케팅이 끝나 있어요"의 실체.
 * 온보딩된 매장마다 블로그 초안 1건을 Gemini로 생성해 posts(draft)로 저장.
 * 사장님은 아침 브리핑에서 [붙여넣기 →]만 누르면 됨.
 *
 * 사용법:
 *   npx tsx src/generate-daily.ts            # 전 매장, 오늘 이미 만든 매장은 스킵(멱등)
 *   npx tsx src/generate-daily.ts --force    # 오늘 만든 게 있어도 재생성(테스트)
 *   npx tsx src/generate-daily.ts --store=<uuid>
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_GENERATIVE_AI_API_KEY
 *      (선택) TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID — 생성 결과 알림
 * 주의: Gemini 무료티어는 매장당 2호출 소모 → 파일럿 규모(수 개 매장)만 무료로 감당.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateChannelDrafts } from '../../shared/content-engine/orchestrator.js';
import { placeFromBrandTone } from '../../shared/content-engine/place-facts.js';
import { resolveOfferings } from '../../shared/content-engine/offerings.js';
import { contentChannelsFor, CHANNEL_TO_POST } from '../../shared/channels/registry.js';
import { resolveBusinessType } from '../../shared/business/taxonomy.js';
import { dailyDirective, repeatedTitleWords, titleDirective } from '../../shared/content-engine/angles.js';
import { seasonalContext } from '../../shared/content-engine/seasonal.js';
import type { DraftInput, IndustryId, BrandTone } from '../../shared/content-engine/types.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY_STORE = args.find((a) => a.startsWith('--store='))?.split('=')[1];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https')
  ? process.env.NEXT_PUBLIC_APP_URL
  : 'https://marketing-allinone.vercel.app';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimited = (e: unknown) => /429|quota|rate/i.test(e instanceof Error ? e.message : String(e));

/**
 * 429는 대부분 분당(RPM) 제한(무료 flash ~10RPM) — 65초 쉬고 재시도.
 * 재시도까지 소진돼야 진짜 일일(RPD) 한도로 판단. (예전엔 429 한 번에 남은 매장
 * 전부 포기 → 매장 몇 곳만 돼도 크론이 중도 포기하는 버그)
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string, retries = 2): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimited(e) || i >= retries) throw e;
      console.log(`[${label}] 429(분당 제한 추정) → 65초 대기 후 재시도 ${i + 1}/${retries}`);
      await sleep(65_000);
    }
  }
}

function kstTodayStartISO(): string {
  // KST(UTC+9) 자정 → UTC ISO
  const now = new Date();
  const kstMs = now.getTime() + 9 * 3600_000;
  const kstMidnightMs = Math.floor(kstMs / 86_400_000) * 86_400_000;
  return new Date(kstMidnightMs - 9 * 3600_000).toISOString();
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  }).catch(() => {});
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ SUPABASE URL/SERVICE_ROLE_KEY 필요');
    process.exit(1);
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY 필요');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let q = supabase
    .from('stores')
    .select('id, name, industry_id, naver_place_url, naver_blog_url, address, brand_tone')
    .not('onboarded_at', 'is', null);
  if (ONLY_STORE) q = q.eq('id', ONLY_STORE);
  const { data: stores, error } = await q;
  if (error) {
    console.error('❌ stores 조회 실패:', error.message);
    process.exit(1);
  }
  if (!stores?.length) {
    console.log('온보딩된 매장 없음. 종료.');
    return;
  }

  const todayStart = kstTodayStartISO();
  console.log(`📋 대상 매장 ${stores.length}곳 (오늘 KST 시작: ${todayStart})\n`);

  // 적체 방지: 지난 '자동 데일리' 초안은 보관 처리.
  // 마케팅 글은 시의성이 생명이라 어제 것을 오늘 브리핑에 남기면 무덤이 됨.
  // (사장님이 직접 만든 초안(auto!=daily)은 손대지 않음 — 의도적으로 요청한 것)
  {
    const { data: archived, error: arcErr } = await supabase
      .from('posts')
      .update({ status: 'archived' })
      .eq('status', 'draft')
      .contains('metadata', { auto: 'daily' })
      .lt('created_at', todayStart)
      .select('id');
    if (arcErr) console.log(`⚠️ 지난 초안 보관 실패(무시하고 진행): ${arcErr.message}`);
    else if (archived?.length) console.log(`🗂  지난 자동 초안 ${archived.length}건 보관 처리\n`);
  }

  let made = 0, skipped = 0, failed = 0;
  for (const s of stores) {
    // 멱등: 오늘 데일리 초안이 이미 있으면 스킵
    if (!FORCE) {
      const { data: existing } = await supabase
        .from('posts')
        .select('id')
        .eq('store_id', s.id)
        .gte('created_at', todayStart)
        .contains('metadata', { auto: 'daily' })
        .limit(1);
      if (existing?.length) {
        console.log(`[${s.name}] 오늘 데일리 초안 이미 있음 → 스킵`);
        skipped++;
        continue;
      }
    }

    // 오늘의 방향 = 각도 로테이션 + 시점 + 중심 소재 로테이션(모두 반복 방지)
    const offering = resolveBusinessType(s.industry_id).offering;
    const offeringNames = resolveOfferings(s.brand_tone, placeFromBrandTone(s.brand_tone)).map((o) => o.name);
    const daily = dailyDirective(offering, s.id, Date.now(), offeringNames);
    const { angle, length: angleLength } = daily;

    // 최근 쓴 제목을 피하도록 지시(장기 반복 방지) — 최근 블로그 5건 제목
    const { data: recent } = await supabase
      .from('posts')
      .select('title')
      .eq('store_id', s.id)
      .eq('channel', 'blog')
      .not('title', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    const recentTitles = (recent ?? []).map((r) => r.title).filter(Boolean) as string[];
    // 반복 시어를 명시적으로 금지 — "겹치지 않게" 소극 지시로는 '쉼표'류 관성을 못 막음(실측)
    const banned = repeatedTitleWords(recentTitles, [s.name, s.address ?? '']);
    const avoidHint = recentTitles.length
      ? ` 최근 제목들: ${recentTitles.map((t) => `"${t}"`).join(', ')}. 이들과 시작 구조를 반복하지 말 것.`
      : '';
    const angleDirective = daily.directive + avoidHint;
    // 제목 규칙은 본문 단계에 직접 주입(angle에 넣으면 기획 단계에서 유실 — 실측)
    const sn = seasonalContext(Date.now());
    const titleRule = titleDirective(daily.titleStyle, s.name, banned, `${sn.month}월 ${sn.season}`);

    const input: DraftInput = {
      store: {
        id: s.id,
        name: s.name,
        industryId: (s.industry_id ?? 'cafe') as IndustryId,
        naverPlaceUrl: s.naver_place_url ?? undefined,
        naverBlogUrl: s.naver_blog_url ?? undefined,
        address: s.address ?? undefined,
        brandTone: (s.brand_tone ?? {}) as BrandTone,
      },
      // 크롤된 매장 실사실(메뉴·가격·영업시간) → 프롬프트 placeFactSection
      place: placeFromBrandTone(s.brand_tone),
      photos: [],
      targetLength: angleLength, // 각도 성격에 맞는 길이(심층=길게, 팁=짧게)
      angle: angleDirective,
      titleRule,
    };

    try {
      // 연결 채널 존중: 연결된 모든 콘텐츠 채널에 생성(블로그는 항상 anchor).
      // 인스타·페북·구글·스레드를 켠 매장은 그 채널 글도 함께 나온다.
      // 비용: 마스터 1회 + 단문 네이티브 1회 배치 — 채널 수만큼 배수 X.
      const { data: conns } = await supabase
        .from('channel_connections')
        .select('channel_id')
        .eq('store_id', s.id);
      const channels = contentChannelsFor((conns ?? []).map((c) => c.channel_id as string));

      const bundle = await withRateLimitRetry(() => generateChannelDrafts(input, channels), s.name);
      const rows = channels
        .map((ch) => {
          const draft = bundle.perChannel[ch];
          const postChannel = CHANNEL_TO_POST[ch];
          if (!draft || !postChannel) return null;
          return {
            store_id: s.id,
            channel: postChannel,
            title: draft.title ?? (ch === 'naver_blog' ? bundle.master.title : null),
            body_html: draft.bodyHtml ?? null,
            body_plain: draft.bodyPlain ?? null,
            tags: draft.tags ?? [],
            status: 'draft' as const,
            // titleStyle 기록 — 제목 규칙 준수 여부를 나중에 역산 없이 바로 진단하기 위해
            metadata: { engineChannel: ch, auto: 'daily', native: draft.meta?.native === true, angle: angle.key, titleStyle: daily.titleStyle.key },
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (!rows.length) throw new Error('생성된 드래프트 없음');

      const { data: inserted, error: insErr } = await supabase
        .from('posts')
        .insert(rows)
        .select('id, channel, title');
      if (insErr) throw new Error(insErr.message);

      made++;
      const blogPost = inserted?.find((p) => p.channel === 'blog') ?? inserted?.[0];
      console.log(`[${s.name}] ✅ 생성(${inserted?.map((p) => p.channel).join('+')}) · 각도:${angle.label}: ${bundle.master.title}`);
      await sendTelegram(
        `☀️ <b>${s.name}</b> 오늘의 초안 ${inserted?.length}건이 준비됐어요 (${inserted?.map((p) => p.channel).join('·')})\n${bundle.master.title}\n${APP_URL}/prepare?post=${blogPost?.id}`,
      );
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[${s.name}] ⚠️ 실패: ${msg.slice(0, 140)}`);
      // 재시도까지 뚫린 429 = 진짜 일일(RPD) 한도 → 남은 매장 중단
      if (/429|quota|rate/i.test(msg)) {
        console.log('Gemini 일일 한도 도달(재시도 후에도 429) → 남은 매장 중단(내일 재시도)');
        break;
      }
    }

    // RPM 페이싱: 다음 매장 전 잠깐 대기(매장당 flash 2콜, 무료 ~10RPM 준수)
    if (stores.length > 1 && s !== stores[stores.length - 1]) await sleep(15_000);
  }

  console.log(`\n완료 — 생성 ${made} · 스킵 ${skipped} · 실패 ${failed}`);
  // 24/7 운영: 부분 실패도 실패로 보고해야 알림이 울리고 재시도 크론이 자가치유한다.
  // (성공 매장은 멱등 스킵이라 재실행 무해 · 실패 매장만 다시 시도됨)
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('❌ 실행 실패:', e.message);
  process.exit(1);
});
