// 심평원 병의원·약국 이름 목록 → datasets/hira-list.json.gz (lib/hira-list.mjs 가 읽음)
// 2026-10-26: 심평원 병원정보 API 가 우리 키만 옛 주소로 되돌려 보내 자주 실패한다 → API 가 안 될 때 이 목록으로 찾는다.
// 약국은 API 에 없어서 약사라고 한 경우에도 이 목록을 쓴다.
//
// 원본: 심평원 '전국 병의원 및 약국 현황'(공공누리 1유형, 출처 표시) — 분기마다 올라온다.
//   병의원 = 진단 시스템이 만든 hospitals.json.gz(같은 원본의 '병원정보서비스' 시트)
//   약국 = 같은 zip 안의 '약국정보서비스' xlsx
// 다시 만들기: node scripts/hira-list.mjs [hospitals.json.gz] [원본 zip]
//   zip 을 열려면 jszip 이 필요하다(이 프로젝트는 외부 패키지가 없어 진단 시스템의 것을 빌려 쓴다 — JSZIP=경로 로 바꿀 수 있음)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIAG = 'C:/Users/FORYOUCOM/Desktop/winaid-diagnosis';
const hospFile = process.argv[2] || `${DIAG}/data/hira/hospitals.json.gz`;
const zipFile = process.argv[3] || (() => {
  const dir = `${DIAG}/data/hira/src`;
  const zips = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f)).map((f) => path.join(dir, f)) : [];
  return zips.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
})();
const JSZip = (await import(pathToFileURL(process.env.JSZIP || `${DIAG}/node_modules/jszip/lib/index.js`).href)).default;

const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]));
const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
// xlsx → 첫 시트의 행 배열 (진단 시스템 scripts/hira-build.mjs 와 같은 방식)
async function readSheet(buf) {
  const z = await JSZip.loadAsync(buf);
  const ssXml = z.file('xl/sharedStrings.xml') ? await z.file('xl/sharedStrings.xml').async('string') : '';
  const shared = [];
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const sheetName = Object.keys(z.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
  const xml = await z.file(sheetName).async('string');
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ''] = cm;
      const t = (attrs.match(/\st="([^"]+)"/) ?? [])[1];
      let v = null;
      if (t === 's') v = shared[Number((inner.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1])] ?? null;
      else if (t === 'inlineStr') v = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else {
        const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        v = raw == null ? null : t === 'str' ? decode(raw) : Number(raw);
      }
      row[colIndex(ref)] = v;
    }
    rows.push(row);
  }
  return rows;
}

// 주소는 시·구까지만 담는다(파일 크기·필요한 만큼만)
const area = (addr) => String(addr || '').trim().split(/\s+/).slice(0, 2).join(' ');

const hosp = JSON.parse(zlib.gunzipSync(fs.readFileSync(hospFile)));
const C = Object.fromEntries(hosp.cols.map((c, i) => [c, i]));
const rows = hosp.rows.map((r) => [r[C.name], r[C.kind], area(r[C.addr]), Number(r[C.doctors]) || 0]);
console.log(`병의원 ${rows.length}곳 (${hosp.asOf})`);

const outer = await JSZip.loadAsync(fs.readFileSync(zipFile));
const entry = Object.keys(outer.files).find((f) => /약국정보서비스.*\.xlsx$/.test(f));
if (!entry) throw new Error("zip 안에 '약국정보서비스' xlsx 가 없습니다");
const prow = await readSheet(await outer.file(entry).async('nodebuffer'));
const head = prow[0].map((x) => String(x ?? '').trim());
const ix = (k) => {
  const i = head.indexOf(k);
  if (i < 0) throw new Error(`약국 열 '${k}' 이 없습니다 (머리: ${head.join(',')})`);
  return i;
};
const P = { name: ix('요양기관명'), addr: ix('주소') };
let pharm = 0;
for (const r of prow.slice(1)) {
  if (!r[P.name]) continue;
  rows.push([String(r[P.name]).trim(), '약국', area(r[P.addr]), 0]);
  pharm += 1;
}
console.log(`약국 ${pharm}곳`);
if (rows.length < 90_000) throw new Error(`모두 ${rows.length}곳뿐 — 원본이 잘렸는지 확인 (2026-06 판 병의원 79,772 + 약국 약 2만 5천)`);

const asOf = hosp.asOf;
const out = path.join(ROOT, 'datasets', 'hira-list.json.gz');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ source: '건강보험심사평가원 전국 병의원 및 약국 현황', asOf, cols: ['name', 'kind', 'area', 'doctors'], rows }), { level: 9 }));
console.log(`완료 ${out} — ${rows.length}곳, ${(fs.statSync(out).size / 1e6).toFixed(2)}MB, 기준 ${asOf}`);
