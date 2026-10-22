// 요청 처리 — PC 에서는 dev.mjs 가 서버로 띄우고, Vercel 에서는 api/index.mjs 함수가 부른다.
// 리포트는 서버에 저장하지 않는다: 결과는 암호화 봉투(token.mjs)로 이용자 기기에 둔다.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runAnalysis, previewOf, reportOf, CHECKS } from './analyze.mjs';
import { noteOriginalsDiscarded, recordEvent, recordRevenue, recordVariant, addRequest, setRequestDone, logAdmin, adminStats, PLANS, ADDONS, priceFor } from './store.mjs';
import { OFFICIAL, IF_SENT, REPORT_TO } from './links.mjs';
import { JOBS } from './sources.mjs';
import { seal, open } from './token.mjs';

export const PREVIEW_TTL = 60 * 60 * 1000; // 결제 전 사전분석: 1시간
export const REPORT_TTL = 24 * 60 * 60 * 1000; // 결제한 리포트: 24시간

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
const fail = (code, message) => Object.assign(new Error(message), { code });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(fail(413, 'too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Vercel 은 본문을 미리 읽어 req.body 로 준다. PC 서버는 직접 읽는다.
async function readJson(req, limit = 200_000) {
  let b = req.body;
  if (b !== undefined && b !== null) {
    if (Buffer.isBuffer(b)) b = b.toString('utf8');
    if (typeof b === 'object') return b;
    try {
      return JSON.parse(b || '{}');
    } catch {
      throw fail(400, 'bad_json');
    }
  }
  const body = await readBody(req, limit);
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw fail(400, 'bad_json');
  }
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

function adminOk(req) {
  const key = String(req.headers['x-admin-key'] || '');
  const want = process.env.ADMIN_KEY || '';
  if (!want || key.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(want));
}

function reportPayload(t) {
  return {
    ...reportOf(t.result, t.plan, { casefile: t.casefile }),
    id: t.id, createdAt: t.createdAt, expiresAt: t.exp, paidAt: t.paidAt || null, official: OFFICIAL, ifSent: IF_SENT, reportTo: REPORT_TO,
    // 이 리포트에서 살 수 있는 것과 값 — 재검사는 정밀 분석 뒤 24시간 안에만
    offers: { full: t.plan === 'full' ? null : t.fullPrice || null, casefile: t.casefile ? null : ADDONS.casefile.price, recheck: t.plan === 'full' ? ADDONS.recheck.price : null },
  };
}

// 재검사 자격 — 이 기기에서 24시간 안에 정밀 분석을 결제한 다른 리포트가 있으면 재검사 값으로
function recheckOk(token, id) {
  const p = open(token);
  return Boolean(p && p.plan === 'full' && p.id !== id && p.paidAt && Date.now() - p.paidAt < REPORT_TTL);
}

const ROUTES = {
  // 정밀 분석 값은 방문자마다 정해진 시험 가격(?v=방문자)
  'GET /api/config': (req) => {
    const visitor = new URL(req.url, 'http://localhost').searchParams.get('v') || String(req.headers?.['x-visitor'] || '');
    return {
      checks: CHECKS.map(({ id, no, title, plan, sources }) => ({ id, no, title, plan, sources })),
      plans: { free: { label: PLANS.free.label, price: 0 }, full: { label: PLANS.full.label, price: priceFor(visitor) } },
      addons: Object.fromEntries(Object.entries(ADDONS).map(([k, v]) => [k, { label: v.label, price: v.price }])),
      jobs: JOBS,
      official: OFFICIAL,
    };
  },

  'POST /api/event': async (req) => {
    const b = await readJson(req, 2000);
    recordEvent(String(b.type || ''), String(b.visitor || ''));
    return { ok: true };
  },

  // STEP 4~5 — 실행 가능한 검사를 돌리고 무료 사전분석만 보여 준다. 원본은 여기서 버린다.
  'POST /api/analyze': async (req) => {
    const b = await readJson(req, 6_000_000);
    recordEvent('inputs_done', String(b.visitor || ''));
    const result = await runAnalysis(b.input || {});
    noteOriginalsDiscarded(result.originals);
    delete result.originals;
    const now = Date.now();
    const id = crypto.randomBytes(9).toString('base64url');
    const fullPrice = priceFor(String(b.visitor || ''));
    recordVariant(fullPrice, 'shown');
    const token = seal({ v: 1, id, result, createdAt: now, exp: now + PREVIEW_TTL, plan: null, fullPrice });
    return { id, token, expiresInMin: Math.round(PREVIEW_TTL / 60000), preview: previewOf(result) };
  },

  // STEP 6 — 시험판 결제(실제 결제 없음). 무료 점검 열기 · 정밀 분석(가격 시험·재검사 값) · 신고용 정리본 추가
  'POST /api/pay': async (req) => {
    const b = await readJson(req, 400_000);
    const t = open(b.token);
    if (!t || !t.result) throw fail(404, '분석 결과를 찾을 수 없습니다. 다시 점검해 주세요.');
    if (Date.now() > t.exp) throw fail(410, '보관 시간이 지나 분석 결과가 삭제되었습니다. 다시 점검해 주세요.');
    const now = Date.now();
    // 예전 Standard 는 무료 점검과 같다
    const was = t.plan === 'standard' ? 'free' : t.plan;

    if (b.addon === 'casefile') {
      if (!was) throw fail(402, '리포트를 연 뒤 추가할 수 있습니다.');
      if (t.casefile) return { id: t.id, reportToken: seal(t), expiresAt: t.exp, report: reportPayload(t) };
      recordEvent('addon_casefile');
      recordRevenue(ADDONS.casefile.price);
      const next = { ...t, casefile: true, exp: Math.max(t.exp, now + REPORT_TTL) };
      return { id: t.id, reportToken: seal(next), expiresAt: next.exp, report: reportPayload(next) };
    }

    let plan = String(b.plan || '');
    if (plan === 'standard') plan = 'free';
    if (!PLANS[plan]) throw fail(400, '요금제를 골라 주세요.');
    if (was === 'full') plan = 'full';
    let price = 0;
    if (plan === 'full' && was !== 'full') {
      const recheck = b.recheckToken && recheckOk(String(b.recheckToken), t.id);
      price = recheck ? ADDONS.recheck.price : t.fullPrice || priceFor(String(b.visitor || ''));
      recordEvent(recheck ? 'addon_recheck' : was === 'free' ? 'upgrade_full' : 'paid_full');
      if (!recheck) recordVariant(t.fullPrice || price, 'paid');
      recordRevenue(price);
    } else if (!was) {
      recordEvent('paid_free');
    }
    const paid = { ...t, plan, paidAt: plan === 'full' && was !== 'full' ? now : t.paidAt || now, paidPrice: price || t.paidPrice || 0, exp: now + REPORT_TTL };
    return { id: t.id, reportToken: seal(paid), expiresAt: paid.exp, report: reportPayload(paid) };
  },

  // STEP 7 — 이용자 기기에 둔 봉투로 리포트를 연다
  'POST /api/report': async (req) => {
    const b = await readJson(req, 400_000);
    const t = open(b.token);
    if (!t || !t.result) throw fail(404, '리포트를 찾을 수 없습니다.');
    if (!t.plan) throw fail(402, '리포트를 연 뒤 볼 수 있습니다.');
    if (Date.now() > t.exp) throw fail(410, '보관 시간이 지나 리포트가 자동으로 삭제되었습니다.');
    recordEvent('report_view');
    return reportPayload(t);
  },

  'POST /api/request': async (req) => {
    const b = await readJson(req, 10_000);
    if (!String(b.message || '').trim()) throw fail(400, '내용을 적어 주세요.');
    return { ok: true, id: addRequest(b) };
  },

  'GET /api/admin/stats': (req) => {
    if (!adminOk(req)) throw fail(401, '관리자 키가 맞지 않습니다.');
    logAdmin('통계 열람', clientIp(req));
    return adminStats();
  },

  'POST /api/admin/request-done': async (req) => {
    if (!adminOk(req)) throw fail(401, '관리자 키가 맞지 않습니다.');
    const b = await readJson(req, 2000);
    logAdmin(`요청 처리 표시 ${b.id}`, clientIp(req));
    return { ok: setRequestDone(String(b.id || ''), b.done) };
  },
};

export async function handle(req, res) {
  let url = new URL(req.url, 'http://localhost');
  // Vercel 에서 /api/* 를 api/index 로 넘길 때 원래 경로를 __path 로 받는다
  const forwarded = url.searchParams.get('__path');
  if (url.pathname === '/api/index' && forwarded !== null) url = new URL(`/api/${forwarded}`, 'http://localhost');
  try {
    const handler = ROUTES[`${req.method} ${url.pathname}`];
    if (handler) return json(res, 200, await handler(req));
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: '없는 주소입니다.' });

    // 화면 파일 — Vercel 에서는 CDN 이 직접 내보내고, PC 서버에서만 여기로 온다
    if (req.method !== 'GET') return send(res, 405, '');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel || rel.startsWith('report/')) rel = 'index.html';
    if (rel === 'admin') rel = 'admin.html';
    let file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res, 403, '');
    let data = await readFile(file).catch(() => null);
    // 깔끔한 주소: /guide/romance-scam → guide/romance-scam.html (Vercel cleanUrls 와 같게)
    if (!data && !path.extname(file)) {
      file = `${file}.html`;
      data = await readFile(file).catch(() => null);
    }
    if (!data) return send(res, 404, '없는 주소입니다.');
    const ext = path.extname(file);
    return send(res, 200, data, MIME[ext] || 'application/octet-stream', ext === '.jpg' ? { 'Cache-Control': 'public, max-age=86400' } : {});
  } catch (e) {
    const code = Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    const msg = e.message === 'too_large' ? '올린 사진이 너무 큽니다. 사진 수를 줄여 주세요.'
      : e.message === 'bad_json' ? '요청을 읽지 못했습니다.'
        : code === 500 ? '검증 중에 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' : e.message;
    return json(res, code, { error: msg });
  }
}
