// 요청 처리 — PC 에서는 dev.mjs 가 서버로 띄우고, Vercel 에서는 api/index.mjs 함수가 부른다.
// 2026-10-27 오너: 결제·통신판매 없이, 로그인해야 모든 기능을 쓴다(첫 화면·안내 페이지·예시 리포트는 누구나).
// 조회 기록은 서버만 풀 수 있는 암호화 봉투(token.mjs)로 내 계정에 30일 — 원본(사진·대화)은 서버 어디에도 남기지 않는다.
import path from 'node:path';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runAnalysis, reportOf, hasCheckable, CHECKS } from './analyze.mjs';
import { noteOriginalsDiscarded, recordEvent, addRequest, setRequestDone, logAdmin, adminStats } from './store.mjs';
import { OFFICIAL, IF_SENT, REPORT_TO } from './links.mjs';
import { JOBS } from './sources.mjs';
import { seal, open } from './token.mjs';
import * as supa from './supa.mjs';
import { currentUser, setSession, clearSession, cookie, parseCookies, sameOrigin, siteOrigin, pkcePair, safeNext, PKCE, NEXT, CONSENT_VERSION } from './auth.mjs';

export const REPORT_TTL = 30 * 86400_000; // 조회 기록: 내 계정에 30일
export const RETENTION_DAYS = 30;
// 계정마다 조회 한도 — 10분에 10번, 24시간에 30번(AI·공공데이터 비용과 남용을 막는다)
export const QUOTA = { windows: [600, 86400], maxes: [10, 30] };

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
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const REDIRECT = Symbol('redirect');
const redirect = (to) => ({ [REDIRECT]: to });

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

// 접속 주소별 횟수 제한 — 함수 인스턴스마다 따로 세는 1차 방어. 계정별 한도는 데이터베이스(take_quota)가 센다
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
  analyze: [{ max: 20, windowMs: 10 * 60_000 }, { max: 100, windowMs: 86_400_000 }],
  login: [{ max: 20, windowMs: 10 * 60_000 }],
  signup: [{ max: 6, windowMs: 60 * 60_000 }],
  recover: [{ max: 5, windowMs: 60 * 60_000 }],
  request: [{ max: 5, windowMs: 60 * 60_000 }],
  admin: [{ max: 10, windowMs: 15 * 60_000 }],
};
const BUSY_MSG = {
  analyze: '짧은 시간에 조회를 많이 하셨어요. 10분쯤 뒤 다시 시도해 주세요.',
  login: '로그인을 짧은 시간에 여러 번 시도하셨어요. 10분쯤 뒤 다시 시도해 주세요.',
  signup: '가입을 짧은 시간에 여러 번 시도하셨어요. 한 시간쯤 뒤 다시 시도해 주세요.',
  recover: '비밀번호 찾기 메일을 여러 번 요청하셨어요. 한 시간쯤 뒤 다시 시도해 주세요.',
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

// ---------- 회원 ----------
async function needUser(req, ctx) {
  const user = await currentUser(req, ctx);
  if (!user) throw fail(401, '로그인이 필요해요. 로그인하면 바로 이어서 쓸 수 있어요.', { login: true });
  return user;
}
// 약관·처리방침 동의 — 소셜 로그인으로 처음 들어온 회원은 동의 화면을 먼저 거친다
const agreed = new Map();
async function hasConsent(userId) {
  if (agreed.get(userId) === CONSENT_VERSION) return true;
  const rows = await supa.db.select('consents', { select: 'version', user_id: `eq.${userId}`, version: `eq.${CONSENT_VERSION}` });
  if (rows.length) agreed.set(userId, CONSENT_VERSION);
  return rows.length > 0;
}
async function needConsent(user) {
  if (!(await hasConsent(user.id))) throw fail(403, '이용약관과 개인정보 처리방침에 동의해야 조회할 수 있어요.', { consent: true });
}
async function saveConsent(userId) {
  await supa.db.upsert('consents', { user_id: userId, version: CONSENT_VERSION });
  agreed.set(userId, CONSENT_VERSION);
}
// 가입 동의 세 가지 — 만 14세 이상·이용약관·개인정보 수집·이용(모두 필수)
const allAgreed = (a) => Boolean(a && a.age === true && a.terms === true && a.privacy === true);
const AGREE_MSG = '만 14세 이상 확인, 이용약관, 개인정보 수집·이용에 모두 동의해 주세요.';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
function checkEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!EMAIL.test(e)) throw fail(400, '이메일 주소를 다시 확인해 주세요.');
  return e;
}
function checkPassword(v) {
  const p = String(v || '');
  if (p.length < 8 || p.length > 72 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) throw fail(400, '비밀번호는 영문과 숫자를 섞어 8자 이상으로 정해 주세요.');
  return p;
}

async function quota(userId) {
  const blocked = await supa.db.rpc('take_quota', { p_user: userId, p_bucket: 'analyze', p_windows: QUOTA.windows, p_maxes: QUOTA.maxes });
  if (Number(blocked) === QUOTA.windows[0]) throw fail(429, `10분에 ${QUOTA.maxes[0]}번까지 조회할 수 있어요. 잠시 뒤 다시 시도해 주세요.`);
  if (Number(blocked) > 0) throw fail(429, `24시간에 ${QUOTA.maxes[1]}번까지 조회할 수 있어요. 조금 뒤 다시 시도해 주세요.`);
}
const usedToday = (userId) => supa.db.count('usage_hits', { user_id: `eq.${userId}`, bucket: 'eq.analyze', at: `gte.${new Date(Date.now() - 86400_000).toISOString()}` });

// ---------- 리포트 ----------
function reportPayload(t) {
  return { ...reportOf(t.result), id: t.id, createdAt: t.createdAt, expiresAt: t.exp, official: OFFICIAL, ifSent: IF_SENT, reportTo: REPORT_TO };
}
const reportId = () => crypto.randomBytes(9).toString('base64url');
const ID = /^[A-Za-z0-9_-]{8,20}$/;

// 화면이 보내도 되는 이벤트 — 가입·조회처럼 서버만 남기는 이벤트는 받지 않는다(누구나 숫자를 부풀릴 수 있던 것, 2026-10-27)
const CLIENT_EVENTS = new Set(['landing_view', 'wizard_open', 'auth_open', 'official_click', 'naver_click', 'copy', 'howto_zoom', 'casefile_print']);
const clientEvent = (t) => CLIENT_EVENTS.has(t) || /^howto_(open_)?[a-z][a-z_-]{0,24}$/.test(t);
const visitorOf = (b) => String(b?.visitor || '');

const ROUTES = {
  'GET /api/config': async () => ({
    checks: CHECKS.map(({ id, no, title, sources }) => ({ id, no, title, sources })),
    jobs: JOBS,
    official: OFFICIAL,
    auth: await supa.providers(),
    quota: { per10min: QUOTA.maxes[0], perDay: QUOTA.maxes[1] },
    retentionDays: RETENTION_DAYS,
  }),

  'POST /api/event': async (req) => {
    const b = await readJson(req, 2000);
    const type = String(b.type || '');
    if (clientEvent(type)) recordEvent(type, visitorOf(b));
    return { ok: true };
  },

  // ---------- 로그인 ----------
  'GET /api/me': async (req, ctx) => {
    const user = await currentUser(req, ctx);
    if (!user) return { user: null };
    const [consent, today] = await Promise.all([hasConsent(user.id), usedToday(user.id).catch(() => null)]);
    return { user: { email: user.email, provider: user.provider, createdAt: user.createdAt }, consent, usage: { today, perDay: QUOTA.maxes[1] } };
  },

  'POST /api/auth/signup': async (req, ctx) => {
    limit('signup', req);
    const b = await readJson(req, 4000);
    const email = checkEmail(b.email);
    const password = checkPassword(b.password);
    if (!allAgreed(b.agree)) throw fail(400, AGREE_MSG);
    const r = await supa.signUp(email, password);
    const id = r.session?.user?.id || r.user?.id;
    if (id) await saveConsent(id);
    recordEvent('signup', visitorOf(b));
    if (r.session) setSession(req, ctx, r.session);
    // 메일 확인을 켜 두면 세션 없이 돌아온다 — 메일함의 링크를 누르면 /api/auth/confirm 으로 로그인된다
    return { ok: true, confirm: !r.session };
  },

  'POST /api/auth/login': async (req, ctx) => {
    limit('login', req);
    const b = await readJson(req, 4000);
    const s = await supa.signIn(checkEmail(b.email), String(b.password || ''));
    setSession(req, ctx, s);
    recordEvent('login', visitorOf(b));
    return { ok: true };
  },

  // 구글·카카오 — Supabase 로그인 화면으로 보냈다가 /api/auth/callback 으로 돌아온다(PKCE)
  'GET /api/auth/oauth': async (req, ctx) => {
    const provider = ctx.url.searchParams.get('provider');
    const on = await supa.providers();
    if (!['google', 'kakao'].includes(provider) || !on[provider]) return redirect('/?login_error=provider');
    const { verifier, challenge } = pkcePair();
    ctx.cookies.push(cookie(req, PKCE, verifier, 600, '/api/auth'), cookie(req, NEXT, safeNext(ctx.url.searchParams.get('next')), 600, '/api/auth'));
    return redirect(supa.authorizeUrl(provider, `${siteOrigin(req)}/api/auth/callback`, challenge));
  },

  'GET /api/auth/callback': async (req, ctx) => {
    const c = parseCookies(req);
    const code = ctx.url.searchParams.get('code');
    ctx.cookies.push(cookie(req, PKCE, '', 0, '/api/auth'), cookie(req, NEXT, '', 0, '/api/auth'));
    if (!code || !c[PKCE]) return redirect('/?login_error=cancel');
    try {
      setSession(req, ctx, await supa.exchangeCode(code, c[PKCE]));
    } catch {
      return redirect('/?login_error=expired');
    }
    recordEvent('login');
    const next = safeNext(c[NEXT]);
    return redirect(`${next}${next.includes('?') ? '&' : '?'}login=1`);
  },

  // 메일의 확인·비밀번호 재설정 링크 — 다른 기기에서 열어도 되게 token_hash 로 확인한다
  'GET /api/auth/confirm': async (req, ctx) => {
    const tokenHash = ctx.url.searchParams.get('token_hash') || '';
    const type = ctx.url.searchParams.get('type') || '';
    if (!tokenHash || !['email', 'signup', 'recovery'].includes(type)) return redirect('/?link_error=1');
    try {
      setSession(req, ctx, await supa.verifyLink(tokenHash, type));
    } catch {
      return redirect('/?link_error=1');
    }
    return redirect(type === 'recovery' ? '/my?reset=1' : '/?confirmed=1');
  },

  'POST /api/auth/logout': async (req, ctx) => {
    const user = await currentUser(req, ctx).catch(() => null);
    if (user && ctx.access) await supa.signOut(ctx.access);
    clearSession(req, ctx);
    return { ok: true };
  },

  // 가입 여부를 알려 주지 않도록, 보낼 수 없는 경우가 아니면 늘 '보냈다'고 답한다
  'POST /api/auth/recover': async (req) => {
    limit('recover', req);
    const b = await readJson(req, 2000);
    const email = checkEmail(b.email);
    try {
      await supa.sendRecovery(email);
    } catch (e) {
      if (e.code === 429 || e.code === 503 || e.authCode === 'email_address_not_authorized') throw e;
    }
    return { ok: true };
  },

  'POST /api/auth/password': async (req, ctx) => {
    await needUser(req, ctx);
    const b = await readJson(req, 2000);
    await supa.setPassword(ctx.access, checkPassword(b.password));
    return { ok: true };
  },

  'POST /api/consent': async (req, ctx) => {
    const user = await needUser(req, ctx);
    const b = await readJson(req, 2000);
    if (!allAgreed(b.agree)) throw fail(400, AGREE_MSG);
    await saveConsent(user.id);
    return { ok: true };
  },

  // 회원 탈퇴 — 회원을 지우면 조회 기록·동의·횟수 기록이 함께 지워진다(db/schema.sql on delete cascade)
  'POST /api/me/delete': async (req, ctx) => {
    const user = await needUser(req, ctx);
    const b = await readJson(req, 2000);
    if (b.confirm !== true) throw fail(400, '탈퇴 안내를 확인하고 체크해 주세요.');
    if (ctx.access) await supa.signOut(ctx.access);
    await supa.deleteUser(user.id);
    agreed.delete(user.id);
    clearSession(req, ctx);
    return { ok: true };
  },

  // ---------- 조회 ----------
  // 입력을 받아 13개 항목을 돌리고, 결과를 암호화해 내 계정에 남긴다. 원본은 여기서 버린다.
  'POST /api/analyze': async (req, ctx) => {
    const user = await needUser(req, ctx);
    await needConsent(user);
    limit('analyze', req);
    const b = await readJson(req, 6_000_000);
    if (b.attest !== true) throw fail(400, '조회 전 확인 항목에 체크해 주세요.');
    if (!hasCheckable(b.input || {})) throw fail(400, '조회할 정보가 없습니다. 전화번호, 대화, 링크처럼 조회할 정보를 하나 이상 넣어 주세요.');
    await quota(user.id);
    recordEvent('inputs_done', visitorOf(b));
    const result = await runAnalysis(b.input || {});
    if (!result.totals.checkable) throw fail(400, '조회할 정보가 없습니다. 전화번호, 대화, 링크처럼 조회할 정보를 하나 이상 넣어 주세요.');
    noteOriginalsDiscarded(result.originals);
    delete result.originals;
    const now = Date.now();
    const t = { v: 2, id: reportId(), user: user.id, result, createdAt: now, exp: now + REPORT_TTL };
    await supa.db.insert('reports', {
      id: t.id,
      user_id: user.id,
      expires_at: new Date(t.exp).toISOString(),
      checked: result.items.filter((i) => i.checkable).map((i) => i.id),
      signals: result.totals.signals,
      notes: result.totals.notes,
      sealed: seal(t),
    });
    return { id: t.id, report: reportPayload(t) };
  },

  // 내 조회 내역 — 목록에는 숫자만(봉투는 열지 않는다)
  'GET /api/reports': async (req, ctx) => {
    const user = await needUser(req, ctx);
    const rows = await supa.db.select('reports', { select: 'id,created_at,expires_at,checked,signals,notes', user_id: `eq.${user.id}`, expires_at: `gt.${new Date().toISOString()}`, order: 'created_at.desc', limit: '100' });
    return { reports: rows.map((r) => ({ id: r.id, createdAt: Date.parse(r.created_at), expiresAt: Date.parse(r.expires_at), checked: r.checked || [], signals: r.signals, notes: r.notes })), retentionDays: RETENTION_DAYS };
  },

  'POST /api/report': async (req, ctx) => {
    const user = await needUser(req, ctx);
    const b = await readJson(req, 2000);
    const id = String(b.id || '');
    if (!ID.test(id)) throw fail(404, '조회 기록을 찾을 수 없습니다.');
    const [row] = await supa.db.select('reports', { select: 'sealed,expires_at', id: `eq.${id}`, user_id: `eq.${user.id}` });
    const t = row ? open(row.sealed) : null;
    if (!t || t.user !== user.id || !t.result) throw fail(404, '조회 기록을 찾을 수 없습니다. 지운 기록이거나 다른 계정으로 조회한 기록일 수 있어요.');
    if (Date.now() > t.exp) throw fail(410, `보관 기간(${RETENTION_DAYS}일)이 지나 조회 기록이 자동으로 지워졌습니다.`);
    recordEvent('report_view');
    return reportPayload(t);
  },

  'POST /api/report/delete': async (req, ctx) => {
    const user = await needUser(req, ctx);
    const b = await readJson(req, 2000);
    const id = String(b.id || '');
    if (!ID.test(id)) throw fail(404, '조회 기록을 찾을 수 없습니다.');
    const gone = await supa.db.remove('reports', { id: `eq.${id}`, user_id: `eq.${user.id}`, select: 'id' });
    return { ok: true, deleted: gone.length };
  },

  // 삭제 요청·문의·신고 — 로그인 없이도 받는다(조회된 번호의 주인처럼 회원이 아닌 사람도 삭제를 요청할 수 있어야 한다)
  'POST /api/request': async (req, ctx) => {
    limit('request', req);
    const b = await readJson(req, 10_000);
    const message = String(b.message || '').trim().slice(0, 2000);
    if (!message) throw fail(400, '내용을 적어 주세요.');
    const type = ['delete', 'inquiry', 'report'].includes(b.type) ? b.type : 'inquiry';
    const contact = String(b.contact || '').trim().slice(0, 120);
    const user = await currentUser(req, ctx).catch(() => null);
    if (!supa.supaReady()) return { ok: true, id: addRequest({ type, message, contact }) };
    const id = crypto.randomBytes(4).toString('hex');
    await supa.db.insert('requests', { id, user_id: user?.id || null, type, message, contact });
    return { ok: true, id };
  },

  'GET /api/admin/stats': async (req) => {
    if (!adminOk(req)) throw fail(401, '관리자 키가 맞지 않습니다. 다시 입력해 주세요.');
    logAdmin('통계 열람', clientIp(req));
    const stats = adminStats();
    if (supa.supaReady()) {
      const [members, requests] = await Promise.all([
        supa.db.rpc('admin_counts', {}).catch(() => null),
        supa.db.select('requests', { select: 'id,created_at,type,message,contact,done', order: 'created_at.desc', limit: '100' }).catch(() => null),
      ]);
      stats.members = members;
      if (requests) stats.requests = requests.map((r) => ({ id: r.id, at: Date.parse(r.created_at), type: r.type, message: r.message, contact: r.contact, done: r.done }));
    }
    return stats;
  },

  'POST /api/admin/request-done': async (req) => {
    if (!adminOk(req)) throw fail(401, '관리자 키가 맞지 않습니다.');
    const b = await readJson(req, 2000);
    const id = String(b.id || '');
    logAdmin(`요청 처리 표시 ${id}`, clientIp(req));
    if (!supa.supaReady()) return { ok: setRequestDone(id, b.done) };
    const rows = await supa.db.update('requests', { id: `eq.${id}` }, { done: Boolean(b.done) });
    return { ok: rows.length > 0 };
  },
};

// 요청마다 이용자 접속 주소를 담아 둔다 — 로그인 서버 횟수 제한을 이용자별로(supa.mjs requestScope)
export function handle(req, res) {
  return supa.requestScope.run({ ip: clientIp(req) }, () => handleRequest(req, res));
}

async function handleRequest(req, res) {
  let url = new URL(req.url, 'http://localhost');
  // Vercel 에서 /api/* 를 api/index 로 넘길 때 원래 경로를 __path 로 받는다 — 나머지 물음표 뒤 값(code 등)은 그대로 둔다
  const forwarded = url.searchParams.get('__path');
  if (url.pathname === '/api/index' && forwarded !== null) {
    const qs = new URLSearchParams(url.search);
    qs.delete('__path');
    url = new URL(`/api/${forwarded}${qs.toString() ? `?${qs}` : ''}`, 'http://localhost');
  }
  const ctx = { url, cookies: [], user: undefined, access: null };
  const withCookies = (extra = {}) => (ctx.cookies.length ? { ...extra, 'Set-Cookie': ctx.cookies } : extra);
  try {
    const handler = ROUTES[`${req.method} ${url.pathname}`];
    if (handler) {
      // 바깥 사이트에서 우리 쿠키를 싣고 보내는 요청은 받지 않는다
      if (req.method !== 'GET' && !sameOrigin(req)) throw fail(403, '이 화면에서 보낸 요청이 아니라 받지 않았습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      const out = await handler(req, ctx);
      if (out && out[REDIRECT]) return send(res, 302, '', 'text/plain; charset=utf-8', withCookies({ Location: out[REDIRECT] }));
      return send(res, 200, JSON.stringify(out), 'application/json; charset=utf-8', withCookies());
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, JSON.stringify({ error: '없는 주소입니다.' }), 'application/json; charset=utf-8');

    // 화면 파일 — Vercel 에서는 CDN 이 직접 내보내고, PC 서버에서만 여기로 온다
    if (req.method !== 'GET') return send(res, 405, '');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel || rel.startsWith('report/') || rel === 'my') rel = 'index.html';
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
    if (e.db) console.error('db', e.db, e.detail || '');
    const msg = e.message === 'too_large' ? '올린 사진이 너무 커서 받지 못했습니다. 캡처를 몇 장 빼고 다시 시도해 주세요.'
      : e.message === 'bad_json' ? '보낸 내용을 읽지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
        : code === 500 ? '조회 중에 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요. 계속 안 되면 화면 맨 아래 ‘삭제 요청·문의·신고’로 알려 주세요.' : e.message;
    const body = { error: msg };
    if (e.login) body.login = true;
    if (e.consent) body.consent = true;
    return send(res, code, JSON.stringify(body), 'application/json; charset=utf-8', withCookies());
  }
}
