// 심평원 병의원·약국 이름 목록으로 찾기 — datasets/hira-list.json.gz (scripts/hira-list.mjs 로 만듦, 분기 판)
// 2026-10-26: 심평원 병원정보 API 가 우리 키만 옛 주소로 되돌려 보내 자주 실패해서, API 가 안 될 때 이 목록으로 찾는다.
// 약국은 API 에 없어 약사라고 한 경우에는 처음부터 이 목록을 쓴다.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { nameKey } from '../public/parse-input.js';

const FILE = fileURLToPath(new URL('../datasets/hira-list.json.gz', import.meta.url));
let cache = null;

// 처음 찾을 때 한 번만 읽는다(약 0.1초, 10만 5천 곳)
function load() {
  if (!cache) {
    const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)));
    cache = { asOf: j.asOf, rows: j.rows.map(([name, kind, area, doctors]) => ({ name, kind, area, doctors, key: nameKey(name) })) };
  }
  return cache;
}

// '2026-06' → '2026년 6월'
export const asOfText = (asOf) => String(asOf || '').replace(/^(\d{4})-0?(\d{1,2}).*$/, '$1년 $2월');

// 이름 일부로 찾는다(API 와 같은 방식). 이름이 똑같은 곳 → 이름이 그 말로 끝나는 곳 → 나머지, 같은 순위면 의사 많은 곳부터
export function searchHiraList(q, { pharmacy = false } = {}) {
  const { asOf, rows } = load();
  const k = nameKey(q);
  if (k.length < 2) return { asOf, total: 0, items: [] };
  const hits = rows.filter((r) => (pharmacy ? r.kind === '약국' : r.kind !== '약국') && r.key.includes(k));
  const rank = (r) => (r.key === k ? 0 : r.key.endsWith(k) ? 1 : 2);
  hits.sort((a, b) => rank(a) - rank(b) || b.doctors - a.doctors);
  return { asOf, total: hits.length, exact: hits.filter((r) => r.key === k).length, items: hits.slice(0, 30) };
}
