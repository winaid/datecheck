// 로고에서 파비콘·앱 아이콘·공유 이미지·검색엔진 로고를, 카드 배경에서 카드 이미지를 만든다.
// 실행: SHARP_PATH=<sharp/lib/index.js> PLAYWRIGHT_PATH=<playwright/index.mjs> node scripts/build-assets.mjs
// GPT 는 부르지 않는다(카드 배경은 gen-card-bg.mjs 가 이미 만들어 둔 assets/card-bg).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GUIDES } from '../content/guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const imp = (env, name) => import(process.env[env] ? pathToFileURL(process.env[env]).href : name);
const { default: sharp } = await imp('SHARP_PATH', 'sharp');
const { chromium } = await imp('PLAYWRIGHT_PATH', 'playwright');

const MARK = fs.readFileSync(path.join(PUB, 'logo-mark.svg'), 'utf8');
const NAVY = '#0B1424';
const CREAM = '#FAF7F2';

// ---------- 파비콘·앱 아이콘 ----------
const png = (size, { bg = null, scale = 1 } = {}) => {
  const inner = Math.round(size * scale);
  const mark = sharp(Buffer.from(MARK), { density: 1200 }).resize(inner, inner).png();
  if (!bg) return mark.toBuffer();
  return mark.toBuffer().then((m) => sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: m, gravity: 'center' }]).png().toBuffer());
};
function ico(entries) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, dir, ...entries.map((e) => e.buf)]);
}

fs.copyFileSync(path.join(PUB, 'logo-mark.svg'), path.join(PUB, 'favicon.svg'));
fs.writeFileSync(path.join(PUB, 'favicon.ico'), ico(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, buf: await png(s) })))));
fs.writeFileSync(path.join(PUB, 'apple-touch-icon.png'), await png(180, { bg: NAVY, scale: 0.68 }));
fs.writeFileSync(path.join(PUB, 'icon-192.png'), await png(192, { bg: NAVY, scale: 0.68 }));
fs.writeFileSync(path.join(PUB, 'icon-512.png'), await png(512, { bg: NAVY, scale: 0.68 }));
fs.writeFileSync(path.join(PUB, 'icon-maskable-512.png'), await png(512, { bg: NAVY, scale: 0.56 }));
fs.writeFileSync(path.join(PUB, 'img', 'logo-512.png'), await png(512, { bg: CREAM, scale: 0.72 }));
fs.writeFileSync(path.join(PUB, 'site.webmanifest'), `${JSON.stringify({
  name: 'DATE CHECK',
  short_name: 'DATE CHECK',
  description: '받은 메시지·송금 요청 안전 점검',
  start_url: '/',
  display: 'standalone',
  background_color: CREAM,
  theme_color: NAVY,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2)}\n`);
console.log('파비콘·앱 아이콘 완료');

// ---------- 글자가 들어가는 그림은 브라우저로 그린다(Pretendard) ----------
const FONT = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">';
// 빈 페이지(about:blank)에서는 내 PC 파일 주소가 막히므로 사진은 HTML 안에 넣는다
const dataUrl = (p) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
const browser = await chromium.launch();
async function shoot(html, w, h, out, quality = 86) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ type: 'png' });
  await page.close();
  await sharp(buf).jpeg({ quality, mozjpeg: true }).toFile(out);
}
const markInline = MARK.replace('<svg ', '<svg width="100%" height="100%" ');

// 공유 미리보기 1200×630
await shoot(`<!doctype html><meta charset="utf-8">${FONT}<style>
  *{margin:0;box-sizing:border-box} body{width:1200px;height:630px;font-family:Pretendard,sans-serif;position:relative;overflow:hidden;background:${NAVY}}
  .bg{position:absolute;inset:0;background:url('${dataUrl(path.join(PUB, 'img', 'hero.jpg'))}') 75% 55%/cover}
  .scrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,20,36,.95) 0%,rgba(11,20,36,.82) 52%,rgba(11,20,36,.25) 100%)}
  .in{position:absolute;left:84px;top:96px;right:84px;color:#fff}
  .logo{display:flex;align-items:center;gap:14px;font-weight:900;font-size:34px;letter-spacing:.02em;margin-bottom:64px}
  .logo i{display:block;width:52px;height:52px} .logo b{color:#E8506A}
  h1{font-size:76px;font-weight:800;letter-spacing:-.02em;line-height:1.15;margin-bottom:26px}
  p{font-size:28px;color:rgba(255,255,255,.82);line-height:1.5}
</style><div class="bg"></div><div class="scrim"></div><div class="in">
  <div class="logo"><i>${markInline}</i><span><b>DATE</b> CHECK</span></div>
  <h1>보내기 전, 확인하세요.</h1>
  <p>받은 메시지와 송금 요청을 AI가 먼저 살펴봅니다.</p>
</div>`, 1200, 630, path.join(PUB, 'og.jpg'));
console.log('공유 이미지 완료');

// 카드 800×800 — 사진 위에 카드 이름 (로고는 넣지 않는다: 플레이북 '로고 X')
const cardDir = path.join(PUB, 'img', 'card');
fs.mkdirSync(cardDir, { recursive: true });
for (const g of GUIDES) {
  const bg = path.join(ROOT, 'assets', 'card-bg', `${g.slug}.jpg`);
  if (!fs.existsSync(bg)) { console.log(`배경 없음: ${g.slug} (gen-card-bg.mjs 먼저)`); continue; }
  await shoot(`<!doctype html><meta charset="utf-8">${FONT}<style>
    *{margin:0;box-sizing:border-box} body{width:800px;height:800px;font-family:Pretendard,sans-serif;position:relative;overflow:hidden;background:${NAVY}}
    .bg{position:absolute;inset:0;background:url('${dataUrl(bg)}') center/cover}
    .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,20,36,0) 30%,rgba(11,20,36,.55) 58%,rgba(11,20,36,.92) 100%)}
    .t{position:absolute;left:60px;right:60px;bottom:64px;color:#fff}
    .k{display:inline-block;font-size:24px;font-weight:700;color:#fff;background:#E8506A;border-radius:999px;padding:6px 18px;margin-bottom:22px}
    h2{font-size:62px;font-weight:800;line-height:1.2;letter-spacing:-.02em;word-break:keep-all;text-wrap:balance}
  </style><div class="bg"></div><div class="scrim"></div><div class="t"><span class="k">확인 가이드</span><h2>${g.name}</h2></div>`, 800, 800, path.join(cardDir, `${g.slug}.jpg`), 84);
  console.log(`카드 ${g.slug}`);
}
await browser.close();
