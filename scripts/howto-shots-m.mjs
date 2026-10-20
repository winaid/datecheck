// 폰용 직접 조회 안내 캡처 — 경찰민원24 모바일 화면(전화·계좌), 더치트는 PC 화면 검색 칸만 바짝 잘라 큰 꼬리표
// 실행: SHARP_PATH=<sharp/lib/index.js> PLAYWRIGHT_PATH=<playwright/index.mjs> node scripts/howto-shots-m.mjs  (사이트 화면이 바뀌면 다시 찍는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const imp = (env, name) => import(process.env[env] ? pathToFileURL(process.env[env]).href : name);
const { chromium } = await imp('PLAYWRIGHT_PATH', 'playwright');
const sharpMod = await imp('SHARP_PATH', 'sharp');

const sharp = sharpMod.default || sharpMod;
const OUT = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img', 'howto');
const RED = '#E5252A';

async function mark(page, selectors, label, { pad = 8, side = 'top', font = 16 } = {}) {
  await page.evaluate(({ selectors, label, pad, RED, side, font }) => {
    const rects = selectors.map((s) => document.querySelector(s).getBoundingClientRect());
    const x1 = Math.min(...rects.map((r) => r.left)) - pad + scrollX;
    const y1 = Math.min(...rects.map((r) => r.top)) - pad + scrollY;
    const x2 = Math.max(...rects.map((r) => r.right)) + pad + scrollX;
    const y2 = Math.max(...rects.map((r) => r.bottom)) + pad + scrollY;
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px`, border: `4px solid ${RED}`, borderRadius: '12px', boxShadow: '0 0 0 4px rgba(229,37,42,.18)', zIndex: 2147483646, pointerEvents: 'none', boxSizing: 'border-box' });
    const tag = document.createElement('div');
    tag.textContent = side === 'inside' ? `← ${label}` : label;
    Object.assign(tag.style, { position: 'absolute', background: RED, color: '#fff', font: `700 ${font}px/1.15 "Malgun Gothic", sans-serif`, padding: `${Math.round(font * 0.45)}px ${Math.round(font * 0.7)}px`, borderRadius: '8px', zIndex: 2147483647, whiteSpace: 'nowrap', letterSpacing: '-.01em' });
    document.body.append(box, tag);
    const r0 = rects[0];
    if (side === 'inside') { tag.style.top = `${r0.top + scrollY + (r0.height - tag.offsetHeight) / 2}px`; tag.style.left = `${r0.right + scrollX - tag.offsetWidth - 12}px`; }
    else { tag.style.left = `${x1}px`; tag.style.top = `${y1 - tag.offsetHeight - 6}px`; }
  }, { selectors, label, pad, RED, side, font });
}
async function save(buf, name) {
  const file = path.join(OUT, `${name}.webp`);
  await sharp(buf).webp({ quality: 84 }).toFile(file);
  const m = await sharp(file).metadata();
  console.log(name, `${m.width}×${m.height}`, `${Math.round(fs.statSync(file).size / 1024)}KB`);
}

const b = await chromium.launch();
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };

for (const [kind, val, word] of [['phone', 'P', '전화번호'], ['account', 'A', '계좌번호']]) {
  const ctx = await b.newContext(mobile);
  const p = await ctx.newPage();
  await p.goto('https://minwon24.police.go.kr/main.do', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: '[class*="modal"], .dim, .dimmed, .overlay { display: none !important; } html, body { overflow: visible !important; }' });
  await p.selectOption('.cyber-crime .lookup-box select', val);
  await p.evaluate(() => { for (const el of document.querySelectorAll('.cyber-crime *')) if (el.children.length === 0 && el.textContent.includes('거래대상')) el.style.visibility = 'hidden'; });
  await mark(p, ['.cyber-crime .lookup-box select', '#tempid00', '.cyber-crime .lookup-box button'], `${word} 고르고 번호 넣고 조회`, { font: 17 });
  const r = await p.locator('.cyber-crime').boundingBox();
  const sy = await p.evaluate(() => scrollY);
  const buf = await p.screenshot({ fullPage: true, clip: { x: 0, y: r.y + sy - 4, width: 390, height: r.height + 12 } });
  await save(buf, `police-${kind}-m`);
  await ctx.close();
}

{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await p.goto('https://thecheat.co.kr/rb/?mod=_search', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const inp = 'input[name="keyword"]';
  await p.evaluate((s) => { const i = document.querySelector(s); i.closest('form').querySelector('input[type="image"], button').id = 'dc-btn'; }, inp);
  await mark(p, [inp, '#dc-btn'], '번호 넣고 검색', { pad: 8, side: 'inside', font: 26 });
  const r = await p.locator(inp).boundingBox();
  const btn = await p.locator('#dc-btn').boundingBox();
  const buf = await p.screenshot({ clip: { x: r.x - 20, y: r.y - 18, width: btn.x + btn.width - r.x + 40, height: r.height + 36 } });
  await save(buf, 'thecheat-m');
  await p.close();
}
await b.close();
