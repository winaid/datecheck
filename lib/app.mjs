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
  '.json': 'application/json; charset=utf-8',
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
// 미리 읽힌 본문에도 같은 크기 한도를 건다 — 없으면 플랫폼 한도(4.5MB)까지 받던 것(2026-10-27)
async function readJson(req, limit = 200_000) {
  let b = req.body;
  if (b !== undefined && b !== null) {
    if (Buffer.isBuffer(b)) b = b.toString('utf8');
    const size = typeof b === 'object' ? Buffer.byteLength(JSON.stringify(b)) : Buffer.byteLength(String(b));
    if (size > limit) throw fail(413, 'too_large');
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

// Vercel 은 x-real-ip 에 실제 접속 주소를 넣는다(이용자가 보낸 x-forwarded-for 앞자리는 꾸밀 수 있다)
const clientIp = (req) => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

// 횟수 제한 — 같은 접속 주소가 짧은 시간에 너무 많이 부르면 쉬게 한다. 함수 인스턴스마다 따로 세는 1차 방어이고,
// AI·공공데이터 비용과 하루 한도를 한 사람이 다 써 버리지 않게 하는 것이 목적이다(2026-10-27)
const hits = new Map();
export function rateLimited(bucket, ip, { max, windowMs }) {
  if (!ip) return false;
  const now = Date.now();
  const k = `${bucket}:${ip}`;
  const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(k, list); return true; }
  list.push(now);
  hits.set(k, list);
  if (hits.size > 5000) for (const [key, v] of hits) if (!v.some((t) => now - t < 86_400_000)) hits.delete(key);
  return false;
}
// 휴대폰 통신사는 여러 사람이 공용 주소 하나를 같이 쓰는 일이 많아 넉넉히 잡는다 — 막으려는 것은 사람이 아니라 자동 반복이다
export const LIMITS = {
  analyze: [{ max: 12, windowMs: 10 * 60_000 }, { max: 60, windowMs: 86_400_000 }],
  request: [{ max: 5, windowMs: 60 * 60_000 }],
  admin: [{ max: 10, windowMs: 15 * 60_000 }],
};
const BUSY_MSG = {
  analyze: '짧은 시간에 점검을 많이 하셨어요. 10분쯤 뒤 다시 시도해 주세요. 하루에 할 수 있는 점검 횟수에도 한도가 있어요.',
  request: '문의를 짧은 시간에 여러 번 보내셨어요. 한 시간쯤 뒤 다시 보내 주세요. 급하면 보낸 문의에 내용을 모아 적어 주세요.',
  admin: '관리자 키를 여러 번 틀렸습니다. 15분 뒤 다시 시도해 주세요.',
};
// PC 에서 띄운 개발 서버로 내 컴퓨터가 부르는 요청은 세지 않는다(점검 도구가 연달아 부른다). Vercel 에서는 이 주소가 오지 않는다
const localDev = (ip) => !process.env.VERCEL && /^(127\.|::1$|::ffff:127\.)/.test(ip);
function limit(bucket, req) {
  const ip = clientIp(req);
  if (localDev(ip)) return;
  for (const rule of LIMITS[bucket]) if (rateLimited(`${bucket}${rule.windowMs}`, ip, rule)) throw fail(429, BUSY_MSG[bucket]);
}

// 길이가 다른 키나 한글이 섞인 키에도 오류 없이 — 양쪽을 같은 길이(sha256)로 바꿔 비교한다
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
function adminOk(req) {
  const want = process.env.ADMIN_KEY || '';
  if (!want) return false;
  const ok = crypto.timingSafeEqual(sha(req.headers['x-admin-key'] || ''), sha(want));
  // 틀린 시도만 센다 — 열 번 틀리면 15분 쉰다
  if (!ok) limit('admin', req);
  return ok;
}

function reportPayload(t) {
  return {
    ...reportOf(t.result, t.plan, { casefile: t.casefile }),
    id: t.id, createdAt: t.createdAt, expiresAt: t.exp, paidAt: t.paidAt || null, fullPaidAt: t.plan === 'full' ? fullSince(t) || null : null, official: OFFICIAL, ifSent: IF_SENT, reportTo: REPORT_TO,
    // 이 리포트에서 살 수 있는 것과 값 — 재검사는 처음 정밀 분석을 산 뒤 24시간 안에만
    offers: { full: t.plan === 'full' ? null : t.fullPrice || null, casefile: t.casefile ? null : ADDONS.casefile.price, recheck: t.plan === 'full' && Date.now() - fullSince(t) < REPORT_TTL ? ADDONS.recheck.price : null },
  };
}

// 재검사 자격 — 이 기기에서 24시간 안에 정밀 분석을 결제한 다른 리포트가 있으면 재검사 값으로.
// 24시간은 처음 정밀 분석을 산 때부터 센다 — 재검사로 산 리포트가 새 기준이 되어 할인이 끝없이 이어지던 것(2026-10-27)
const fullSince = (p) => p.fullPaidAt || p.paidAt;
function recheckFrom(token, id) {
  const p = open(token);
  return p && p.plan === 'full' && p.id !== id && fullSince(p) && Date.now() - fullSince(p) < REPORT_TTL ? p : null;
}

// 같은 사전분석 봉투로 결제를 다시 보내도 매출·결제 수를 두 번 세지 않는다(인스턴스 안에서). 실제 PG 를 붙이면 결제 번호로 막을 것
const paidOnce = new Map();
function firstPay(id, kind) {
  const k = `${id}:${kind}`;
  const now = Date.now();
  if (paidOnce.has(k)) return false;
  paidOnce.set(k, now);
  if (paidOnce.size > 5000) for (const [key, t] of paidOnce) if (now - t > REPORT_TTL) paidOnce.delete(key);
  return true;
}

// 화면이 보내도 되는 이벤트 — 결제·매출처럼 서버만 남기는 이벤트는 받지 않는다(누구나 결제 수를 부풀릴 수 있던 것, 2026-10-27)
const CLIENT_EVENTS = new Set(['landing_view', 'wizard_open', 'preview_view', 'plan_view', 'official_click', 'naver_click', 'copy', 'howto_zoom', 'casefile_print']);
const clientEvent = (t) => CLIENT_EVENTS.has(t) || /^howto_(open_)?[a-z][a-z_-]{0,24}$/.test(t);

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
    const type = String(b.type || '');
    if (clientEvent(type)) recordEvent(type, String(b.visitor || ''));
    return { ok: true };
  },

  // STEP 4~5 — 실행 가능한 검사를 돌리고 무료 사전분석만 보여 준다. 원본은 여기서 버린다.
  'POST /api/analyze': async (req) => {
    limit('analyze', req);
    const b = await readJson(req, 6_000_000);
    recordEvent('inputs_done', String(b.visitor || ''));
    const result = await runAnalysis(b.input || {});
    // 화면에서 막지만, 예전 화면이나 직접 보낸 요청도 쉬운 말로 돌려보낸다
    if (!result.totals.checkable) throw fail(400, '점검할 정보가 없습니다. 전화번호, 대화, 링크처럼 상대에게 받은 정보를 하나 이상 넣어 주세요.');
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
      if (firstPay(t.id, 'casefile')) {
        recordEvent('addon_casefile');
        recordRevenue(ADDONS.casefile.price);
      }
      const next = { ...t, casefile: true, exp: Math.max(t.exp, now + REPORT_TTL) };
      return { id: t.id, reportToken: seal(next), expiresAt: next.exp, report: reportPayload(next) };
    }

    let plan = String(b.plan || '');
    if (plan === 'standard') plan = 'free';
    if (!PLANS[plan]) throw fail(400, '요금제를 골라 주세요.');
    if (was === 'full') plan = 'full';
    const upgrading = plan === 'full' && was !== 'full';
    let price = 0;
    let fullPaidAt = t.fullPaidAt || null;
    if (upgrading) {
      const from = b.recheckToken ? recheckFrom(String(b.recheckToken), t.id) : null;
      price = from ? ADDONS.recheck.price : t.fullPrice || priceFor(String(b.visitor || ''));
      fullPaidAt = from ? fullSince(from) : now;
      if (firstPay(t.id, 'full')) {
        recordEvent(from ? 'addon_recheck' : was === 'free' ? 'upgrade_full' : 'paid_full');
        if (!from) recordVariant(t.fullPrice || price, 'paid');
        recordRevenue(price);
      }
    } else if (!was && firstPay(t.id, 'free')) {
      recordEvent('paid_free');
    }
    // 처음 열 때와 정밀 분석으로 올릴 때만 보관 24시간을 새로 센다 — 같은 리포트로 다시 불러 보관을 끝없이 늘리던 것(2026-10-27)
    const fresh = !was || upgrading;
    const paid = { ...t, plan, paidAt: upgrading ? now : t.paidAt || now, fullPaidAt, paidPrice: price || t.paidPrice || 0, exp: fresh ? now + REPORT_TTL : t.exp };
    return { id: t.id, reportToken: seal(paid), expiresAt: paid.exp, report: reportPayload(paid) };
  },

  // STEP 7 — 이용자 기기에 둔 봉투로 리포트를 연다
  'POST /api/report': async (req) => {
    const b = await readJson(req, 400_000);
    const t = open(b.token);
    if (!t || !t.result) throw fail(404, '리포트를 찾을 수 없습니다. 보관 시간이 지났거나 다른 기기에서 연 주소일 수 있어요. 새로 점검해 주세요.');
    if (!t.plan) throw fail(402, '아직 열지 않은 리포트입니다. 점검 화면에서 리포트 열기를 눌러 주세요.');
    if (Date.now() > t.exp) throw fail(410, '보관 시간이 지나 리포트가 자동으로 삭제되었습니다.');
    recordEvent('report_view');
    return reportPayload(t);
  },

  'POST /api/request': async (req) => {
    limit('request', req);
    const b = await readJson(req, 10_000);
    if (!String(b.message || '').trim()) throw fail(400, '내용을 적어 주세요.');
    return { ok: true, id: addRequest(b) };
  },

  'GET /api/admin/stats': (req) => {
    if (!adminOk(req)) throw fail(401, '관리자 키가 맞지 않습니다. 다시 입력해 주세요.');
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
    if (!data) {
      // Vercel 은 public/404.html 을 알아서 내보낸다 — PC 서버도 같게
      const page = await readFile(path.join(PUBLIC, '404.html')).catch(() => null);
      return page ? send(res, 404, page, MIME['.html']) : send(res, 404, '없는 주소입니다.');
    }
    const ext = path.extname(file);
    return send(res, 200, data, MIME[ext] || 'application/octet-stream', ext === '.jpg' ? { 'Cache-Control': 'public, max-age=86400' } : {});
  } catch (e) {
    const code = Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    const msg = e.message === 'too_large' ? '올린 사진이 너무 커서 받지 못했습니다. 캡처를 몇 장 빼고 다시 시도해 주세요.'
      : e.message === 'bad_json' ? '보낸 내용을 읽지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
        : code === 500 ? '점검 중에 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요. 계속 안 되면 화면 맨 아래 ‘삭제 요청·문의·신고’로 알려 주세요.' : e.message;
    return json(res, code, { error: msg });
  }
}
