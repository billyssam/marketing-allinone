/**
 * 플레이스 정보 크롤 — 매장 실사실(메뉴·가격·영업시간·전화)을 수집해
 * stores.brand_tone.place_facts 에 저장(스키마 변경 없이 jsonb 재활용).
 * 콘텐츠 생성 시 placeFactSection이 이 값을 프롬프트에 박아 "지어내지 않는 글"을 만든다.
 *
 * 사용법: npx tsx src/crawl-place.ts [--force] [--store=<uuid>]
 * 멱등: place_facts.crawled_at이 7일 이내면 스킵(메뉴는 자주 안 바뀜, --force로 강제).
 * GitHub Actions(리뷰 크롤 워크플로)에서 함께 실행 — Playwright 필요.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { crawlNaverPlace, extractPlaceId } from '../../shared/content-engine/place-crawler.js';
import { normalizeHours, cleanDirections, normalizePhone } from '../../shared/content-engine/place-facts.js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local') });
loadEnv();

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY_STORE = args.find((a) => a.startsWith('--store='))?.split('=')[1];
const STALE_MS = 7 * 86_400_000; // 7일

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ SUPABASE URL/SERVICE_ROLE_KEY 필요');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let q = supabase
    .from('stores')
    .select('id, name, naver_place_url, brand_tone')
    .not('naver_place_url', 'is', null);
  if (ONLY_STORE) q = q.eq('id', ONLY_STORE);
  const { data: stores, error } = await q;
  if (error) {
    console.error('❌ stores 조회 실패:', error.message);
    process.exit(1);
  }
  if (!stores?.length) {
    console.log('플레이스 URL 등록 매장 없음. 종료.');
    return;
  }

  console.log(`📋 대상 매장 ${stores.length}곳\n`);
  let ok = 0, skipped = 0, failed = 0;

  for (const s of stores) {
    const tone = (s.brand_tone ?? {}) as Record<string, unknown>;
    const prev = tone.place_facts as { crawled_at?: string } | undefined;
    if (!FORCE && prev?.crawled_at && Date.now() - Date.parse(prev.crawled_at) < STALE_MS) {
      console.log(`[${s.name}] place_facts ${prev.crawled_at.slice(0, 10)} 크롤분 있음 → 스킵`);
      skipped++;
      continue;
    }
    const placeId = extractPlaceId(s.naver_place_url as string);
    if (!placeId) {
      console.log(`[${s.name}] ⚠️ place id 추출 실패: ${s.naver_place_url}`);
      failed++;
      continue;
    }

    try {
      const info = await crawlNaverPlace(s.naver_place_url as string);
      // 리뷰 총량 이력 — 사장님이 가장 궁금해하는 "리뷰 늘었나?"에 답하려면 시점별 기록이 필요하다.
      // place_facts는 덮어쓰기라 이력이 남지 않으므로 배열로 따로 쌓는다(최근 12회 = 약 3개월).
      // 정확한 수치일 때만 쌓는다 — "1.5만" 같은 축약은 늘어도 안 변해서 추이를 왜곡한다.
      const prevHistory = (prev as { reviewHistory?: { at: string; count: number }[] } | undefined)?.reviewHistory ?? [];
      const rc = info.reviewCount;
      const reviewHistory =
        rc?.exact && rc.count > 0
          ? [...prevHistory, { at: new Date().toISOString(), count: rc.count }].slice(-12)
          : prevHistory;

      const place_facts = {
        name: info.name,
        address: info.address,
        phone: normalizePhone(info.phone) ?? null,
        // 크롤 시점 정제 — 네이버 DOM이 상태·라스트오더를 붙여 뱉는 깨진 hours 교정
        hours: normalizeHours(info.hours) ?? null,
        categories: info.categories,
        descriptionRaw: cleanDirections(info.descriptionRaw) ?? null,
        menu: (info.menu ?? []).slice(0, 20),
        reviewCount: info.reviewCount ?? null,
        reviewHistory,
        crawled_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabase
        .from('stores')
        .update({ brand_tone: { ...tone, place_facts } })
        .eq('id', s.id);
      if (upErr) throw new Error(upErr.message);
      ok++;
      console.log(`[${s.name}] ✅ 저장 — 메뉴 ${place_facts.menu.length}종 · ${place_facts.hours ? '영업시간O' : '영업시간X'} · ${place_facts.phone ? '전화O' : '전화X'}`);
    } catch (e) {
      failed++;
      console.log(`[${s.name}] ⚠️ 크롤 실패: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  console.log(`\n완료 — 저장 ${ok} · 스킵 ${skipped} · 실패 ${failed}`);
}

main().catch((e) => {
  console.error('❌ 실행 실패:', e.message);
  process.exit(1);
});
