import { chromium, type Page } from 'playwright';
import type { PlaceInfo } from './types';

const NAVER_PLACE_ID_REGEX = /place\/(\d+)/;
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function extractPlaceId(url: string): string | null {
  const m = url.match(NAVER_PLACE_ID_REGEX);
  return m ? m[1] : null;
}

/**
 * 네이버 플레이스 URL → 매장 정보.
 * 스냅샷 실측 기반 셀렉터. 라벨 텍스트로 정보 그룹 매칭 (hash 클래스 회피).
 *
 * ⚠️ 배포 시 주의:
 * - Vercel 서버리스에서는 실행 불가 (Chromium 미포함)
 * - 프로덕션에서는 별도 사설 워커로 이관 권장
 */
export async function crawlNaverPlace(url: string): Promise<PlaceInfo> {
  const placeId = extractPlaceId(url);
  if (!placeId) throw new Error(`네이버 플레이스 ID 추출 실패: ${url}`);

  const targetUrl = `https://m.place.naver.com/place/${placeId}/home`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: MOBILE_UA,
      viewport: { width: 393, height: 852 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
      if (!g.__name) g.__name = (fn) => fn;
    });
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

      const name = norm(document.querySelector('h1')?.textContent);

      // 카테고리 (텍스트 노드 walker)
      const CAT = new Set([
        '카페',
        '음식점',
        '동물병원',
        '베이커리',
        '한식',
        '중식',
        '일식',
        '양식',
        '분식',
        '치킨',
        '피자',
        '고기',
      ]);
      const categories: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const t = node.nodeValue?.trim();
        if (t && CAT.has(t)) {
          categories.push(t);
          break;
        }
      }

      // 정보 그룹: <div class="O8qbU ...">, 안에 <strong><span class="place_blind">라벨</span></strong> + 값 요소들
      const groupsByLabel: Record<string, Element> = {};
      document.querySelectorAll('div.O8qbU').forEach((g) => {
        const label = norm(g.querySelector('strong .place_blind')?.textContent);
        if (label) groupsByLabel[label] = g;
      });

      const valueOf = (label: string): string => {
        const g = groupsByLabel[label];
        if (!g) return '';
        const parts: string[] = [];
        Array.from(g.children).forEach((child) => {
          if (child.tagName === 'STRONG') return;
          parts.push(norm(child.textContent));
        });
        return norm(parts.join(' '));
      };

      // 주소 그룹 안의 실제 주소 값만 (첫 role=button 안 첫 span)
      const addressGroup = groupsByLabel['주소'];
      const addressPrimary = addressGroup
        ? norm(
            addressGroup.querySelector('[role="button"] span, a[role="button"] span, button span')
              ?.textContent,
          )
        : '';
      const addressFallback = valueOf('주소')
        .replace(/(?:지도|내비게이션|거리뷰|복사)/g, '')
        .trim();
      const address = addressPrimary || addressFallback;

      // 영업시간: 첫 자식 요소의 aria-label 또는 텍스트
      const hoursGroup = groupsByLabel['영업시간'];
      let hours = '';
      if (hoursGroup) {
        const btn = hoursGroup.querySelector('a[role="button"], button');
        const aria = btn?.getAttribute('aria-label') ?? '';
        const txt = btn?.textContent ?? '';
        hours = norm(aria || txt).replace(/펼쳐보기|접기/g, '').trim();
      }

      // 전화번호
      const phone = valueOf('전화번호').replace(/전화번호|복사/g, '').trim();

      // 찾아가는길
      const descriptionRaw = valueOf('찾아가는길')
        .replace(/찾아가는길|내용 더보기|더보기/g, '')
        .trim();

      // 편의 시설 (참고용, PlaceInfo 스키마 확장 시 활용)
      const amenities = valueOf('편의');

      return { name, categories, address, phone, hours, descriptionRaw, amenities };
    });

    // 메뉴는 별도 evaluate (스크롤 후 지연 로드 대응)
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(600);
    const menu = await extractMenu(page);

    return {
      name: info.name,
      address: info.address,
      phone: info.phone || undefined,
      hours: info.hours || undefined,
      categories: info.categories,
      descriptionRaw: info.descriptionRaw || undefined,
      menu: menu.slice(0, 30),
    };
  } finally {
    await browser.close();
  }
}

async function extractMenu(page: Page): Promise<{ name: string; price?: number }[]> {
  return page.evaluate(() => {
    const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const results: { name: string; price?: number }[] = [];
    const seen = new Set<string>();

    // 메뉴 li는 반드시 a[href*="/menu/"] (이름 링크)를 포함
    document.querySelectorAll('li').forEach((li) => {
      const nameLink = li.querySelector('a[href*="/menu/"]');
      if (!nameLink) return;
      const name = norm(nameLink.textContent);
      if (!name || name.length < 1 || name.length > 60) return;

      // 가격: li 안 첫 em (부모 텍스트에 '원')
      const emCandidates = Array.from(li.querySelectorAll('em'));
      let priceEm: HTMLElement | null = null;
      for (const em of emCandidates) {
        const parentTxt = norm(em.parentElement?.textContent);
        if (parentTxt.includes('원')) {
          priceEm = em as HTMLElement;
          break;
        }
      }
      if (!priceEm) return;
      const price = Number((priceEm.textContent ?? '').replace(/,/g, ''));
      if (!Number.isFinite(price) || price < 500 || price >= 1_000_000) return;

      if (seen.has(name)) return;
      seen.add(name);
      results.push({ name, price });
    });

    return results;
  });
}
