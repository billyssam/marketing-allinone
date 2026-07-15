#!/usr/bin/env node
/**
 * PWA 아이콘 생성 — 앱 로고(앰버 라운드 스퀘어 + ㅁ)를 그대로 PNG로.
 * manifest가 가리키던 icon-192/512.png가 실재하지 않아 홈화면 추가가 깨져 있었음.
 *   node scripts/make-icons.mjs
 * maskable 대응: 배경을 캔버스 전면에 채우고 마크는 중앙 안전영역(≈60%)에 배치.
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'web/public');

// 앱 디자인 토큰 (globals.css)
const AMBER = '#ffb534';
const AMBER_2 = '#ffcd6b';
const INK = '#2a1c02';

/**
 * 마크 = 'ㅁ'의 기하학적 형태(정사각 아웃라인).
 * 글리프를 쓰면 폰트 사이드베어링 때문에 아이콘 크기에서 작고 흐릿해져 직접 그린다.
 * 안전영역: 마크 48% (maskable 원형 크롭에도 안 잘림)
 */
const html = (size) => {
  const mark = Math.round(size * 0.48);
  const stroke = Math.round(size * 0.115);
  const radius = Math.round(size * 0.055);
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
  .icon{
    width:${size}px;height:${size}px;
    background:linear-gradient(155deg, ${AMBER_2} 0%, ${AMBER} 62%);
    display:flex;align-items:center;justify-content:center;
  }
  .mark{
    width:${mark}px;height:${mark}px;
    border:${stroke}px solid ${INK};
    border-radius:${radius}px;
    box-sizing:border-box;
  }
</style></head><body><div class="icon"><div class="mark"></div></div></body></html>`;
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const size of [192, 512]) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(html(size), { waitUntil: 'load' });
      await page.waitForTimeout(150); // 폰트 렌더 안정화
      const path = resolve(OUT, `icon-${size}.png`);
      await page.screenshot({ path, omitBackground: false });
      await page.close();
      console.log(`✅ ${path}`);
    }
    // 애플 터치 아이콘(180) — iOS 홈화면 추가용
    const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    await page.setContent(html(180), { waitUntil: 'load' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT, 'apple-icon.png') });
    await page.close();
    console.log(`✅ ${resolve(OUT, 'apple-icon.png')}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
