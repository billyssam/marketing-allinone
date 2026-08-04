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

    // 업종에 따라 /place/ → /hairshop/ /nailshop/ /restaurant/ 등으로 리다이렉트된다.
    // 가격 탭 주소를 만들려면 이 실제 타입이 필요하다.
    const placeType = page.url().match(/m\.place\.naver\.com\/([a-z]+)\/\d+/)?.[1] ?? 'place';

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
    let menu = await extractMenu(page);

    // 홈에 메뉴가 없으면 가격 탭을 본다.
    //
    // 왜 필요한가(실측): 홈 메뉴는 음식점·카페 전용 구조(a[href*="/menu/"])다.
    // 미용실·네일샵·헬스장은 홈에 메뉴가 0건이고 가격이 별도 /price 탭에 있다 —
    // 실제로 준오헤어(셋팅펌 250,000원)·시그니초네일(손젤 29,000원)·
    // 버핏그라운드(PT 26회 1,609,990원) 모두 데이터는 있는데 0건으로 수집됐다.
    // 자영업 업종 대부분이 비음식인데 이대로면 그분들 글엔 실제 가격이 하나도 안 들어간다.
    if (menu.length === 0) {
      try {
        await page.goto(`https://m.place.naver.com/${placeType}/${placeId}/price`, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await page.waitForTimeout(2000);
        menu = await extractPriceTab(page);
      } catch {
        /* 가격 탭이 없는 업종도 많다 — 실패는 정상 경로로 취급하고 나머지 사실만 쓴다 */
      }
    }

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

/**
 * 가격 탭(비음식 업종) 추출.
 *
 * 실측한 3업종(미용실·네일샵·헬스장) 모두 `li` 안에 [이름 텍스트 + <em>가격</em>] 구조이고
 * 클래스명은 해시(dELze·CLSES 등)라 쓸 수 없다 → li/em 관계만으로 잡는다.
 * "여성컷35,000~60,000원"처럼 범위로 적힌 경우 첫 em(하한)을 대표가로 쓴다.
 */
async function extractPriceTab(page: Page): Promise<{ name: string; price?: number }[]> {
  return page.evaluate(() => {
    const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const results: { name: string; price?: number }[] = [];
    const seen = new Set<string>();

    document.querySelectorAll('li').forEach((li) => {
      // 섹션(예: "컷", "손 젤")이 항목 li들을 감싸는 구조라 바깥 li까지 잡으면
      // "컷여성컷" 같이 헤더가 붙은 유령 항목이 생긴다 → 최말단 li만 쓴다.
      if (li.querySelector('li')) return;

      const em = Array.from(li.querySelectorAll('em')).find((e) =>
        /^[\d,]{3,}$/.test(norm(e.textContent)),
      );
      if (!em) return;

      const priceText = norm(em.textContent);
      const price = Number(priceText.replace(/,/g, ''));
      if (!Number.isFinite(price) || price < 500 || price >= 10_000_000) return;

      // 이름 = li 텍스트에서 가격이 시작되기 전까지
      const raw = norm(li.textContent);
      const cut = raw.indexOf(priceText);
      let name = cut > 0 ? raw.slice(0, cut) : '';
      name = name
        .replace(/대표$/, '') // 네이버가 붙이는 "대표" 뱃지
        .replace(/[~\-–]\s*$/, '')
        .trim();
      if (!name || name.length > 60) return;
      if (seen.has(name)) return;
      seen.add(name);
      results.push({ name, price });
    });

    return results;
  });
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
      // 상한 100만원은 음식점 기준이었다 — 헬스장 PT 패키지(1,609,990원)·학원 수강료처럼
      // 정상적으로 100만원을 넘는 업종이 있어 걸러지면 안 된다.
      if (!Number.isFinite(price) || price < 500 || price >= 10_000_000) return;

      if (seen.has(name)) return;
      seen.add(name);
      results.push({ name, price });
    });

    return results;
  });
}
