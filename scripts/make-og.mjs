#!/usr/bin/env node
/**
 * OG 이미지(1200×630) + 파비콘(ICO) 생성 — 브랜드 자산을 코드로.
 *   node scripts/make-og.mjs
 *
 * 왜: 카톡·문자로 링크를 보내면 og:image가 곧 첫인상인데 지금은 아예 없고,
 *     favicon.ico는 리디자인 전 스캐폴드 시절 파일이라 브랜드와 어긋남.
 * 산출: web/src/app/opengraph-image.png · twitter-image.png (Next 파일 컨벤션 → 메타 자동배선)
 *       web/src/app/favicon.ico (32px PNG 임베드 ICO — Vista+ 전 브라우저 지원)
 * 폰트: node_modules/pretendard woff2를 base64로 임베드(외부요청 0, 렌더 결정적).
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(root, 'web/src/app');

const AMBER = '#ffb534';
const AMBER_2 = '#ffcd6b';
const INK = '#2a1c02';
const BG = '#08080a';

const fontB64 = readFileSync(
  resolve(root, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
).toString('base64');

const ogHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Pretendard Variable';
    src: url(data:font/woff2;base64,${fontB64}) format('woff2-variations');
    font-weight: 45 920;
  }
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{
    background:${BG};
    font-family:'Pretendard Variable',sans-serif;
    color:#f6f4f0;
    position:relative;
  }
  /* 랜딩과 동일한 새벽 글로우 */
  .glow{position:absolute;inset:0;
    background:
      radial-gradient(55% 60% at 82% -10%, rgba(255,181,52,0.22), transparent 62%),
      radial-gradient(40% 45% at 12% -8%, rgba(255,77,141,0.08), transparent 60%);}
  .hair{position:absolute;left:0;right:0;top:0;height:1px;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);}
  .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box}
  .brand{display:flex;align-items:center;gap:20px}
  .mark{width:64px;height:64px;border-radius:14px;
    background:linear-gradient(155deg, ${AMBER_2} 0%, ${AMBER} 62%);
    display:flex;align-items:center;justify-content:center}
  .mark i{display:block;width:30px;height:30px;border:7px solid ${INK};border-radius:4px;box-sizing:border-box}
  .name{font-size:30px;font-weight:700;letter-spacing:-0.02em}
  h1{margin:44px 0 0;font-size:88px;line-height:1.04;letter-spacing:-0.045em;font-weight:800}
  h1 .dim{color:#86847d}
  .sub{margin-top:28px;font-size:30px;color:#bdbab2;letter-spacing:-0.01em}
  .url{position:absolute;left:96px;bottom:56px;font-size:24px;color:${AMBER};font-weight:600;letter-spacing:0.01em}
</style></head><body>
  <div class="glow"></div><div class="hair"></div>
  <div class="wrap">
    <div class="brand"><div class="mark"><i></i></div><div class="name">마케팅올인원</div></div>
    <h1>매일 아침,<br>마케팅이 <span class="dim">끝나 있어요.</span></h1>
    <div class="sub">블로그·인스타 초안부터 리뷰 답글까지 — 사장님은 붙여넣기만.</div>
  </div>
  <div class="url">marketing-allinone.vercel.app</div>
</body></html>`;

// 파비콘 마크 — icon-192와 동일 지오메트리(48% 마크, 11.5% 스트로크)
const favHtml = (size) => {
  const mark = Math.round(size * 0.48);
  const stroke = Math.max(2, Math.round(size * 0.115));
  const radius = Math.max(2, Math.round(size * 0.055));
  // 라운드 코너: 앱아이콘 관례 + 코너 투명픽셀로 PNG가 RGBA로 인코딩됨(Turbopack ICO 디코더 요구)
  const corner = Math.max(3, Math.round(size * 0.22));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
  .icon{width:${size}px;height:${size}px;background:linear-gradient(155deg, ${AMBER_2} 0%, ${AMBER} 62%);
    border-radius:${corner}px;
    display:flex;align-items:center;justify-content:center}
  .mark{width:${mark}px;height:${mark}px;border:${stroke}px solid ${INK};border-radius:${radius}px;box-sizing:border-box}
  </style></head><body><div class="icon"><div class="mark"></div></div></body></html>`;
};

/** PNG 바이트들을 ICO 컨테이너로 패킹 (PNG-embedded entries) */
function packIco(pngs /* [{size, buf}] */) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0=256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2);  // palette
    e.writeUInt8(0, 3);  // reserved
    e.writeUInt16LE(1, 4);  // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    // 1) OG 1200×630 → opengraph-image + twitter-image (동일 아트)
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await og.setContent(ogHtml, { waitUntil: 'load' });
    await og.evaluate(() => document.fonts.ready);
    const ogPath = resolve(APP, 'opengraph-image.png');
    await og.screenshot({ path: ogPath });
    writeFileSync(resolve(APP, 'twitter-image.png'), readFileSync(ogPath));
    await og.close();
    console.log(`✅ ${ogPath} (+twitter-image.png)`);

    // 2) favicon.ico — 16/32/48 PNG 임베드
    const pngs = [];
    for (const size of [16, 32, 48]) {
      const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await p.setContent(favHtml(size), { waitUntil: 'load' });
      // omitBackground → RGBA PNG (Turbopack의 ICO 디코더가 RGBA를 요구)
      pngs.push({ size, buf: await p.screenshot({ omitBackground: true }) });
      await p.close();
    }
    const icoPath = resolve(APP, 'favicon.ico');
    writeFileSync(icoPath, packIco(pngs));
    console.log(`✅ ${icoPath} (16+32+48 PNG-ICO)`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
