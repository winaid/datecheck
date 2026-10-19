// 가이드 카드 배경 사진을 gpt-image-2 로 만든다 (오너 지시 2026-10-19). 사람·손·글자 없음.
// 결과는 assets/card-bg/<slug>.jpg 로 저장해 두고, 카드 글자는 build-cards.mjs 가 얹는다(GPT 다시 안 부름).
// 실행: SHARP_PATH=<sharp 위치> node scripts/gen-card-bg.mjs [slug ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GUIDES } from '../content/guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: sharp } = await import(process.env.SHARP_PATH ? pathToFileURL(process.env.SHARP_PATH).href : 'sharp');
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}

const STYLE = 'Cinematic editorial still-life photograph, natural realistic light, shallow depth of field, rich but calm colors, photorealistic, high detail. Keep the lower half of the frame darker and simpler so a title can sit on it. Absolutely no text, no letters, no numbers, no logos, no labels, no readable screens, no people, no faces, no hands, no body parts.';
const want = process.argv.slice(2);
const list = GUIDES.filter((g) => !want.length || want.includes(g.slug));
const out = path.join(ROOT, 'assets', 'card-bg');
fs.mkdirSync(out, { recursive: true });

await Promise.all(list.map(async (g) => {
  const t0 = Date.now();
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2', prompt: `${g.prompt} ${STYLE}`, size: '1024x1024', quality: 'high', n: 1 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${g.slug}: ${JSON.stringify(j).slice(0, 300)}`);
  await sharp(Buffer.from(j.data[0].b64_json, 'base64')).resize(1000, 1000).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(out, `${g.slug}.jpg`));
  console.log(`${g.slug} 완료 ${Math.round((Date.now() - t0) / 1000)}초`);
}));
