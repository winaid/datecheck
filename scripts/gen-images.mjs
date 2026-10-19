// 화면 배경 사진 3장을 gpt-image-2 로 만든다 (오너 지시 2026-10-19).
// 실행: node scripts/gen-images.mjs [hero|bench|cups ...]  — 이름을 주면 그것만 다시 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// sharp 는 이 스크립트에만 필요하다: npm i sharp
const { default: sharp } = await import('sharp');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}

const STYLE = 'Cinematic editorial photograph, natural realistic light, shallow depth of field, subtle film grain, rich but calm colors, photorealistic, high detail. Absolutely no text, no letters, no numbers, no logos, no signage, no readable screens, no people, no faces, no hands, no body parts.';

const JOBS = {
  hero: {
    size: '1536x1024',
    prompt: 'A small round marble cafe table beside a large window at dusk in a quiet Seoul street. On the table: two ceramic coffee cups and a smartphone lying face down. Warm amber pendant light inside, deep navy blue evening city lights softly blurred outside the window. COMPOSITION IS CRITICAL: the table and objects sit in the RIGHT third and lower half of the frame; the entire LEFT half is a calm, dark, softly blurred interior with plenty of empty space reserved for headline text. Palette: deep navy around #0E1A2B, warm amber, a subtle touch of dusty rose. ' + STYLE,
  },
  bench: {
    size: '1536x1024',
    prompt: 'An empty wooden bench in a quiet city park in soft early morning light, light mist, gentle sun rays through trees, calm and safe atmosphere. COMPOSITION: the bench is small in the lower right third; the upper and left areas are open soft sky and gently blurred trees with room for text. Palette: soft cream, pale sage green, muted blue. ' + STYLE,
  },
  cups: {
    size: '1536x1024',
    prompt: 'Two cups of latte with simple latte art on a light oak table in a bright minimal cafe, morning daylight from a window, a small clear glass vase with a single dusty pink ranunculus flower between the cups. Clean, hopeful, warm mood. COMPOSITION: the objects are centered horizontally in the lower middle of the frame; generous empty soft light background above them. Palette: warm white, light oak, dusty rose accents. ' + STYLE,
  },
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(JOBS);
const rawDir = path.join(ROOT, 'scripts', 'gen-raw');
fs.mkdirSync(rawDir, { recursive: true });

await Promise.all(names.map(async (name) => {
  const job = JOBS[name];
  if (!job) throw new Error(`없는 이름: ${name}`);
  const t0 = Date.now();
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2', prompt: job.prompt, size: job.size, quality: 'high', n: 1 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${name}: ${JSON.stringify(j).slice(0, 300)}`);
  const buf = Buffer.from(j.data[0].b64_json, 'base64');
  fs.writeFileSync(path.join(rawDir, `${name}.png`), buf);
  await sharp(buf).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(ROOT, 'public', 'img', `${name}.jpg`));
  await sharp(buf).resize(768).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(ROOT, 'public', 'img', `${name}-sm.jpg`));
  console.log(`${name} 완료 ${Math.round((Date.now() - t0) / 1000)}초`);
}));
