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
import type { DraftInput, IndustryId, BrandTone } from '../../shared/content-engine/types.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY_STORE = args.find((a) => a.startsWith('--store='))?.split('=')[1];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https')
  ? process.env.NEXT_PUBLIC_APP_URL
  : 'https://marketing-allinone.vercel.app';

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
      photos: [],
      targetLength: 'medium',
    };

    try {
      const bundle = await generateChannelDrafts(input, ['naver_blog']);
      const draft = bundle.perChannel.naver_blog;
      if (!draft) throw new Error('naver_blog 드래프트 없음');

      const { data: inserted, error: insErr } = await supabase
        .from('posts')
        .insert({
          store_id: s.id,
          channel: 'blog',
          title: draft.title ?? bundle.master.title,
          body_html: draft.bodyHtml ?? null,
          body_plain: draft.bodyPlain ?? null,
          tags: draft.tags ?? [],
          status: 'draft',
          metadata: { engineChannel: 'naver_blog', auto: 'daily', qualityNotes: bundle.master.qualityNotes ?? [] },
        })
        .select('id, title')
        .single();
      if (insErr) throw new Error(insErr.message);

      made++;
      console.log(`[${s.name}] ✅ 생성: ${inserted.title}`);
      await sendTelegram(
        `☀️ <b>${s.name}</b> 오늘의 블로그 초안이 준비됐어요\n${inserted.title}\n${APP_URL}/prepare?post=${inserted.id}`,
      );
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[${s.name}] ⚠️ 실패: ${msg.slice(0, 140)}`);
      // 429(무료한도)면 이후 매장도 같은 결과 → 조기 종료
      if (/429|quota|rate/i.test(msg)) {
        console.log('Gemini 한도 도달 → 남은 매장 중단(내일 재시도)');
        break;
      }
    }
  }

  console.log(`\n완료 — 생성 ${made} · 스킵 ${skipped} · 실패 ${failed}`);
  if (failed > 0 && made === 0 && skipped === 0) process.exit(1);
}

main().catch((e) => {
  console.error('❌ 실행 실패:', e.message);
  process.exit(1);
});
