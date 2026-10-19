import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env.local'));

const { runAnalysis, previewOf, reportOf, CHECKS } = await import('./lib/analyze.mjs');
const { saveReport, getReport, payReport, noteOriginalsDiscarded, recordEvent, addRequest, setRequestDone, logAdmin, adminStats, PLANS, UNPAID_TTL } = await import('./lib/store.mjs');
const { OFFICIAL, IF_SENT } = await import('./lib/links.mjs');
const { JOBS } = await import('./lib/sources.mjs');

const PORT = Number(process.env.PORT || 4040);
const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too_large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJson(req, limit = 200_000) {
  const body = await readBody(req, limit);
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw Object.assign(new Error('bad_json'), { code: 400 });
  }
}

function adminOk(req) {
  const key = req.headers['x-admin-key'] || '';
  const want = process.env.ADMIN_KEY || '';
  if (!want || key.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(want));
}

const ROUTES = {
  'GET /api/config': () => ({
    checks: CHECKS.map(({ id, no, title, plan, sources }) => ({ id, no, title, plan, sources })),
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { label: v.label, price: v.price }])),
    jobs: JOBS,
    official: OFFICIAL,
  }),

  'POST /api/event': async (req) => {
    const b = await readJson(req, 2000);
    recordEvent(String(b.type || ''), String(b.visitor || ''));
    return { ok: true };
  },

  // STEP 4~5 — 실행 가능한 검사를 돌리고 무료 사전분석만 돌려준다. 원본은 여기서 버린다.
  'POST /api/analyze': async (req) => {
    const b = await readJson(req, 24_000_000);
    recordEvent('inputs_done', String(b.visitor || ''));
    const result = await runAnalysis(b.input || {});
    noteOriginalsDiscarded(result.originals);
    delete result.originals;
    const id = saveReport(result);
    return { id, expiresInMin: Math.round(UNPAID_TTL / 60000), preview: previewOf(result) };
  },

  // STEP 6 — 시험판 결제(실제 결제 없음)
  'POST /api/pay': async (req) => {
    const b = await readJson(req, 2000);
    const r = payReport(String(b.id || ''), String(b.plan || ''));
    if (!r) throw Object.assign(new Error('리포트가 없거나 보관 시간이 지났습니다. 다시 검증해 주세요.'), { code: 404 });
    return { ok: true, plan: r.plan };
  },

  'POST /api/request': async (req) => {
    const b = await readJson(req, 10_000);
    if (!String(b.message || '').trim()) throw Object.assign(new Error('내용을 적어 주세요.'), { code: 400 });
    return { ok: true, id: addRequest(b) };
  },

  'GET /api/admin/stats': (req) => {
    if (!adminOk(req)) throw Object.assign(new Error('관리자 키가 맞지 않습니다.'), { code: 401 });
    logAdmin('통계 열람', req.socket.remoteAddress);
    return adminStats();
  },

  'POST /api/admin/request-done': async (req) => {
    if (!adminOk(req)) throw Object.assign(new Error('관리자 키가 맞지 않습니다.'), { code: 401 });
    const b = await readJson(req, 2000);
    logAdmin(`요청 처리 표시 ${b.id}`, req.socket.remoteAddress);
    return { ok: setRequestDone(String(b.id || ''), b.done) };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // STEP 7 — 결제한 리포트
    const rm = url.pathname.match(/^\/api\/report\/([A-Za-z0-9_-]{8,20})$/);
    if (req.method === 'GET' && rm) {
      const r = getReport(rm[1]);
      if (!r) return json(res, 404, { error: '리포트가 없거나 보관 시간이 지나 자동으로 삭제되었습니다.' });
      if (!r.plan) return json(res, 402, { error: '결제 후 리포트를 볼 수 있습니다.', preview: previewOf(r.result) });
      recordEvent('report_view');
      return json(res, 200, { ...reportOf(r.result, r.plan), id: r.id, createdAt: r.createdAt, expiresAt: r.expiresAt, official: OFFICIAL, ifSent: IF_SENT });
    }
    const handler = ROUTES[`${req.method} ${url.pathname}`];
    if (handler) return json(res, 200, await handler(req));

    if (req.method !== 'GET') return send(res, 405, '');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel || rel.startsWith('report/')) rel = 'index.html';
    if (rel === 'admin') rel = 'admin.html';
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res, 403, '');
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, '없는 주소입니다.');
    const ext = path.extname(file);
    return send(res, 200, data, MIME[ext] || 'application/octet-stream', ext === '.jpg' ? { 'Cache-Control': 'public, max-age=86400' } : {});
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    const msg = e.message === 'too_large' ? '올린 사진이 너무 큽니다. 사진 수를 줄여 주세요.' : code === 500 ? '검증 중에 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' : e.message;
    return json(res, code, { error: msg });
  }
});

server.requestTimeout = 180_000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`DATE CHECK: http://localhost:${PORT}  (관리자 /admin)`);
});
