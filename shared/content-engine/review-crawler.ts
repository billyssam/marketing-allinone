import { chromium } from 'playwright';

/**
 * 네이버 플레이스 방문자 리뷰 크롤러.
 * 실측(2026-07, 쿵더쿵 place 1565864790) 기반 pui__ 시맨틱 셀렉터.
 *
 * ⚠️ 배포 주의:
 * - Vercel 서버리스 실행 불가(Chromium 미포함) → Oracle VM 크롤 워커에서 실행.
 * - 네이버 방문자 리뷰는 별점 폐지(키워드 방식) → rating은 항상 null.
 * - 리뷰 고유 ID를 DOM이 노출하지 않아 (작성자+방문일+본문앞부분) 해시로 안정 ID 생성.
 */

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface CrawledReview {
  /** (작성자+방문일+본문앞60자) 해시 — DB unique(store_id, source, external_id)용 안정 키 */
  externalId: string;
  author: string;
  /** 리뷰 본문 (더보기 펼친 전체) */
  content: string;
  /** 방문일 ISO (YYYY-MM-DD). 파싱 실패 시 undefined */
  visitedAt?: string;
  /** 리뷰에 선택된 키워드 태그 (예: "음료가 맛있어요") */
  keywords: string[];
  /** 영수증 인증 리뷰 여부 */
  receiptVerified: boolean;
}

export interface ReviewCrawlOptions {
  /** 최대 수집 개수 (기본 20) */
  limit?: number;
  headless?: boolean;
  timeoutMs?: number;
}

/** FNV-1a 32bit — 짧고 결정적인 안정 해시 (외부 의존 없음) */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function extractPlaceId(url: string): string | null {
  const m = url.match(/place\/(\d+)/);
  return m ? m[1] : null;
}

export async function crawlNaverPlaceReviews(
  placeId: string,
  opts: ReviewCrawlOptions = {},
): Promise<CrawledReview[]> {
  const limit = opts.limit ?? 20;
  const url = `https://m.place.naver.com/place/${placeId}/review/visitor`;
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    const ctx = await browser.newContext({
      userAgent: MOBILE_UA,
      viewport: { width: 393, height: 852 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    const page = await ctx.newPage();
    // Turbopack/esbuild __name 헬퍼가 evaluate 컨텍스트에 없어서 나는 오류 회피
    await page.addInitScript(() => {
      const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
      if (!g.__name) g.__name = (fn) => fn;
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs ?? 25000 });
    await page.waitForSelector('li.place_apply_pui', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // 목표 개수만큼 로드될 때까지 스크롤 (+ 리스트 하단 더보기)
    for (let i = 0; i < 6; i++) {
      const count = await page.locator('li.place_apply_pui.EjjAW').count();
      if (count >= limit) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(900);
    }

    // 본문 '더보기' 전부 펼치기 (접기 버튼은 건드리지 않음)
    const moreButtons = page.locator('li.place_apply_pui.EjjAW a.pui__wFzIYl', {
      hasText: '더보기',
    });
    const mCount = await moreButtons.count();
    for (let i = 0; i < mCount; i++) {
      await moreButtons.nth(i).click({ timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(500);

    const raw = await page.evaluate((max) => {
      const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
      const items: {
        author: string;
        content: string;
        dateFull: string;
        keywords: string[];
        receipt: boolean;
      }[] = [];

      document.querySelectorAll('li.place_apply_pui.EjjAW').forEach((li) => {
        const author = norm(li.querySelector('.pui__NMi-Dp')?.textContent);

        // 본문: .pui__vn15t2 안 첫 a (더보기/접기 링크 제외)
        let content = '';
        const bodyBox = li.querySelector('.pui__vn15t2');
        if (bodyBox) {
          const bodyLink = Array.from(bodyBox.querySelectorAll('a')).find(
            (a) => !a.className.includes('pui__wFzIYl'),
          );
          content = norm(bodyLink?.textContent ?? bodyBox.textContent);
          content = content.replace(/(더보기|접기)$/g, '').trim();
        }

        // 방문일 정식 표기 (span.pui__blind: "2026년 6월 4일 목요일")
        let dateFull = '';
        li.querySelectorAll('.pui__gfuUIT .pui__blind').forEach((b) => {
          const t = norm(b.textContent);
          if (/\d{4}년/.test(t)) dateFull = t;
        });

        // 키워드 태그
        const keywords: string[] = [];
        li.querySelectorAll('.pui__HLNvmI .pui__jhpEyP').forEach((k) => {
          const t = norm(k.textContent);
          if (t && !t.includes('개의 리뷰') && !t.includes('펼쳐보기')) keywords.push(t);
        });

        const receipt = norm(li.textContent).includes('영수증');

        if (content.length >= 2) {
          items.push({ author, content, dateFull, keywords, receipt });
        }
        void max;
      });
      return items;
    }, limit);

    const reviews: CrawledReview[] = raw.slice(0, limit).map((r) => {
      const visitedAt = parseKoreanDate(r.dateFull);
      const externalId = stableHash(`${r.author}|${r.dateFull}|${r.content.slice(0, 60)}`);
      return {
        externalId,
        author: r.author || '익명',
        content: r.content,
        visitedAt,
        keywords: r.keywords,
        receiptVerified: r.receipt,
      };
    });

    return reviews;
  } finally {
    await browser.close();
  }
}

/** "2026년 6월 4일 목요일" → "2026-06-04" */
function parseKoreanDate(s: string): string | undefined {
  const m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
