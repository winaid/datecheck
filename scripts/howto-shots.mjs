// 직접 조회 안내용 화면 캡처 — 사이트 맨 위(로고·메뉴)부터 검색 칸까지 담고, 검색 칸에 빨간 상자와 꼬리표.
//   police-phone / police-account : 경찰민원24 PC 화면(전화번호·계좌번호를 고른 상태)
//   police-phone-m / police-account-m : 경찰민원24 모바일 화면(맨 위부터 조회 칸까지)
//   thecheat / thecheat-m : 더치트 검색 화면(모바일 화면은 자동 브라우저에서 열리지 않아 PC 화면을 폰 폭에 맞게 자름)
// 실행: SHARP_PATH=<sharp/lib/index.js> PLAYWRIGHT_PATH=<playwright/index.mjs> node scripts/howto-shots.mjs
// 사이트 화면이 바뀌면 다시 찍고, 빨간 상자 위치를 눈으로 확인할 것.
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
const HIDE_POPUPS = '[class*="modal"], .dim, .dimmed, .overlay { display: none !important; } html, body { overflow: visible !important; }';
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, locale: 'ko-KR' };

// 대상 요소들을 감싸는 빨간 상자 + 꼬리표(above: 상자 위, below: 상자 아래)
async function mark(page, selectors, label, { pad = 10, font = 16, line = 4, side = 'above' } = {}) {
  await page.evaluate(({ selectors, label, pad, font, line, side, RED }) => {
    const rects = selectors.map((s) => document.querySelector(s).getBoundingClientRect());
    const x1 = Math.min(...rects.map((r) => r.left)) - pad + scrollX;
    const y1 = Math.min(...rects.map((r) => r.top)) - pad + scrollY;
    const x2 = Math.max(...rects.map((r) => r.right)) + pad + scrollX;
    const y2 = Math.max(...rects.map((r) => r.bottom)) + pad + scrollY;
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px`, border: `${line}px solid ${RED}`, borderRadius: '12px', boxShadow: `0 0 0 ${line}px rgba(229,37,42,.2)`, zIndex: 2147483646, pointerEvents: 'none', boxSizing: 'border-box' });
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, { position: 'absolute', background: RED, color: '#fff', font: `800 ${font}px/1.15 "Malgun Gothic", sans-serif`, padding: `${Math.round(font * 0.45)}px ${Math.round(font * 0.75)}px`, borderRadius: `${Math.round(font * 0.4)}px`, zIndex: 2147483647, whiteSpace: 'nowrap', letterSpacing: '-.01em', boxShadow: '0 6px 16px rgba(0,0,0,.25)' });
    box.dataset.dc = tag.dataset.dc = '1';
    document.body.append(box, tag);
    tag.style.left = `${x1}px`;
    tag.style.top = side === 'below' ? `${y2 + 8}px` : `${y1 - tag.offsetHeight - 8}px`;
  }, { selectors, label, pad, font, line, side, RED });
}

async function save(buf, name) {
  const file = path.join(OUT, `${name}.webp`);
  await sharp(buf).webp({ quality: 82 }).toFile(file);
  const m = await sharp(file).metadata();
  console.log(name, `${m.width}×${m.height}`, `${Math.round(fs.statSync(file).size / 1024)}KB`);
  return [m.width, m.height];
}

const clearMarks = (page) => page.evaluate(() => document.querySelectorAll('[data-dc]').forEach((el) => el.remove()));
const SIZES = {};
const b = await chromium.launch();
const POLICE = 'https://minwon24.police.go.kr/main.do';
const LOOKUP = ['.cyber-crime .lookup-box select', '#tempid00', '.cyber-crime .lookup-box button'];

for (const [kind, val, word] of [['phone', 'P', '전화번호'], ['account', 'A', '계좌번호']]) {
  // PC: 맨 위부터 조회 칸 아래까지
  {
    const ctx = await b.newContext(DESKTOP);
    const p = await ctx.newPage();
    await p.goto(POLICE, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await p.addStyleTag({ content: HIDE_POPUPS });
    await p.selectOption(LOOKUP[0], val);
    await p.evaluate(() => scrollTo(0, 0));
    await mark(p, LOOKUP, `여기서 ${word} 고르고 번호 넣고 조회`, { font: 26, line: 6, pad: 12, side: 'below' });
    const r = await p.locator('.cyber-crime').boundingBox();
    SIZES[`police-${kind}`] = await save(await p.screenshot({ clip: { x: 0, y: 0, width: 1280, height: Math.min(900, r.y + r.height + 24) } }), `police-${kind}`);
    await ctx.close();
  }
  // 폰: 모바일 화면 맨 위부터 조회 칸까지
  {
    const ctx = await b.newContext(MOBILE);
    const p = await ctx.newPage();
    await p.goto(POLICE, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await p.addStyleTag({ content: HIDE_POPUPS });
    await p.selectOption(LOOKUP[0], val);
    await p.evaluate(() => { for (const el of document.querySelectorAll('.cyber-crime *')) if (el.children.length === 0 && el.textContent.includes('거래대상')) el.style.visibility = 'hidden'; });
    await mark(p, LOOKUP, `여기서 ${word} 고르고 조회`, { font: 18, line: 4 });
    const r = await p.locator('.cyber-crime').boundingBox();
    const sy = await p.evaluate(() => scrollY);
    SIZES[`police-${kind}-m`] = await save(await p.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: 390, height: r.y + sy + r.height + 12 } }), `police-${kind}-m`);
    await ctx.close();
  }
}

// 더치트: 머리 메뉴부터 검색 칸까지
{
  const ctx = await b.newContext(DESKTOP);
  const p = await ctx.newPage();
  await p.goto('https://thecheat.co.kr/rb/?mod=_search', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const inp = 'input[name="keyword"]';
  await p.evaluate((s) => { document.querySelector(s).closest('form').querySelector('input[type="image"], button').id = 'dc-btn'; }, inp);
  await mark(p, [inp, '#dc-btn'], '여기에 번호를 붙여 넣고 검색', { font: 26, line: 6, pad: 10, side: 'below' });
  const r = await p.locator(inp).boundingBox();
  const bottom = r.y + r.height + 90;
  const bottomM = r.y + r.height + 136;
  SIZES.thecheat = await save(await p.screenshot({ clip: { x: 0, y: 0, width: 1280, height: bottom } }), 'thecheat');
  // 폰용: 로고·검색 메뉴·검색 칸이 들어가는 폭으로 자르고, 폰 폭으로 줄어도 보이게 선과 꼬리표를 크게
  await clearMarks(p);
  await mark(p, [inp, '#dc-btn'], '여기에 번호 넣고 검색', { font: 48, line: 12, pad: 12, side: 'below' });
  const btn = await p.locator('#dc-btn').boundingBox();
  SIZES['thecheat-m'] = await save(await p.screenshot({ clip: { x: 0, y: 0, width: Math.min(1280, btn.x + btn.width + 30), height: bottomM } }), 'thecheat-m');
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, 'sizes.json'), `${JSON.stringify(SIZES, null, 2)}\n`);
console.log('크기 기록', path.join(OUT, 'sizes.json'));
