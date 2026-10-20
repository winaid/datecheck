// 직접 조회 안내용 화면 캡처 — 경찰민원24(전화번호·계좌번호), 더치트. 검색 칸에 빨간 상자.
// 실행: SHARP_PATH=<sharp/lib/index.js> PLAYWRIGHT_PATH=<playwright/index.mjs> node scripts/howto-shots-pc.mjs  (사이트 화면이 바뀌면 다시 찍는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const imp = (env, name) => import(process.env[env] ? pathToFileURL(process.env[env]).href : name);
const { chromium } = await imp('PLAYWRIGHT_PATH', 'playwright');
const sharpMod = await imp('SHARP_PATH', 'sharp');

const sharp = sharpMod.default || sharpMod;
const OUT = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img', 'howto');
fs.mkdirSync(OUT, { recursive: true });
const RED = '#E5252A';

// 대상 요소들을 감싸는 빨간 상자 + 안내 꼬리표를 페이지 위에 그린다
async function mark(page, selectors, label, { pad = 8, labelSide = 'top' } = {}) {
  await page.evaluate(({ selectors, label, pad, RED, labelSide }) => {
    const rects = selectors.map((s) => document.querySelector(s).getBoundingClientRect());
    const x1 = Math.min(...rects.map((r) => r.left)) - pad + scrollX;
    const y1 = Math.min(...rects.map((r) => r.top)) - pad + scrollY;
    const x2 = Math.max(...rects.map((r) => r.right)) + pad + scrollX;
    const y2 = Math.max(...rects.map((r) => r.bottom)) + pad + scrollY;
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px`, border: `4px solid ${RED}`, borderRadius: '12px', boxShadow: '0 0 0 4px rgba(229,37,42,.18)', zIndex: 2147483646, pointerEvents: 'none', boxSizing: 'border-box' });
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, { position: 'absolute', left: `${x1}px`, top: labelSide === 'top' ? `${y1 - 38}px` : `${y2 + 8}px`, background: RED, color: '#fff', font: '700 16px/1 "Malgun Gothic", sans-serif', padding: '8px 12px', borderRadius: '8px', zIndex: 2147483647, whiteSpace: 'nowrap', letterSpacing: '-.01em' });
    document.body.append(box, tag);
    if (labelSide === 'inside') { tag.textContent = '← ' + label; const r0 = rects[0]; tag.style.top = `${r0.top + scrollY + (r0.height - tag.offsetHeight) / 2}px`; tag.style.left = `${r0.right + scrollX - tag.offsetWidth - 14}px`; }
    if (labelSide === 'topRight') { tag.style.top = `${y1 - 46}px`; tag.style.left = `${x2 - tag.offsetWidth}px`; }
  }, { selectors, label, pad, RED, labelSide });
}

async function save(buf, name) {
  const file = path.join(OUT, `${name}.webp`);
  await sharp(buf).webp({ quality: 84 }).toFile(file);
  const meta = await sharp(file).metadata();
  console.log(name, `${meta.width}×${meta.height}`, `${Math.round(fs.statSync(file).size / 1024)}KB`);
}

const b = await chromium.launch();

// ---------- 경찰민원24 ----------
for (const [kind, val, label] of [['phone', 'P', '① 전화번호 고르기 → ② 번호 붙여넣기 → ③ 조회'], ['account', 'A', '① 계좌번호 고르기 → ② 번호 붙여넣기 → ③ 조회']]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await p.goto('https://minwon24.police.go.kr/main.do', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  // 첫 화면 공지 창은 걷어 낸다
  await p.addStyleTag({ content: '[class*="modal"], .dim, .dimmed, .overlay { display: none !important; } html, body { overflow: visible !important; }' });
  await p.selectOption('.cyber-crime .lookup-box select', val);
  await p.locator('.cyber-crime').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await mark(p, ['.cyber-crime .lookup-box select', '#tempid00', '.cyber-crime .lookup-box button'], label);
  const r = await p.locator('.cyber-crime').boundingBox();
  const buf = await p.screenshot({ clip: { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40 } });
  await save(buf, `police-${kind}`);
  await p.close();
}

// ---------- 더치트 ----------
{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await p.goto('https://thecheat.co.kr/rb/?mod=_search', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const inp = 'input[name="keyword"]';
  await p.evaluate((s) => { const i = document.querySelector(s); const btn = i.closest('form').querySelector('input[type="image"], button'); btn.id = 'dc-btn'; for (const el of document.querySelectorAll('p, div, span')) if (/2006년부터/.test(el.textContent) && el.children.length === 0) el.style.visibility = 'hidden'; }, inp);
  await mark(p, [inp, '#dc-btn'], '여기에 번호 붙여 넣고 검색', { pad: 8, labelSide: 'inside' });
  const r = await p.locator(inp).boundingBox();
  const btn = await p.locator('#dc-btn').boundingBox();
  const x = r.x - 90;
  const w = btn.x + btn.width - r.x + 180;
  const buf = await p.screenshot({ clip: { x, y: r.y - 120, width: w, height: r.height + 175 } });
  await save(buf, 'thecheat');
  await p.close();
}
await b.close();
