// 로그인 상태 — 접속 토큰(1시간)과 갱신 토큰(30일)을 httpOnly 쿠키로만 둔다. 화면 스크립트는 토큰을 볼 수 없다.
// 접속 토큰이 만료되면 서버가 갱신 토큰으로 새로 받아 쿠키를 바꿔 준다(2026-10-27)
import crypto from 'node:crypto';
import { userOf, refresh } from './supa.mjs';

// 약관·처리방침 판 — 내용을 바꾸면 날짜를 올린다. 새 판에 동의하기 전에는 조회할 수 없다
export const CONSENT_VERSION = '2026-10-27';
const AT = 'dc_at';
const RT = 'dc_rt';
export const PKCE = 'dc_pkce';
export const NEXT = 'dc_next';
const RT_AGE = 30 * 86400;

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* 깨진 쿠키는 버린다 */ }
  }
  return out;
}

const proto = (req) => String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
export const isHttps = (req) => proto(req) === 'https' || Boolean(process.env.VERCEL);
const hostOf = (req) => String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
// 로그인 뒤 돌아올 주소의 앞부분 — 운영은 고정 주소, PC 는 요청이 온 주소(Supabase 가 허용 목록으로 다시 거른다)
export const siteOrigin = (req) => process.env.SITE_URL || `${isHttps(req) ? 'https' : 'http'}://${hostOf(req)}`;

export function cookie(req, name, value, maxAge, path = '/') {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Lax', isHttps(req) ? 'Secure' : null].filter(Boolean).join('; ');
}

// 바깥 사이트가 우리 쿠키를 싣고 보내는 요청 막기 — 브라우저가 붙이는 Origin 이 우리 주소와 다르면 거절한다.
// Origin 이 없는 요청(같은 출처의 오래된 브라우저·서버끼리)은 SameSite=Lax 쿠키가 따로 막는다
export function sameOrigin(req) {
  const o = req.headers?.origin;
  if (!o || o === 'null') return !o;
  try { return new URL(o).host === hostOf(req); } catch { return false; }
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
const seen = new Map(); // 접속 토큰 → 회원 (60초) — 같은 화면이 연달아 부를 때 Supabase 를 매번 부르지 않게
function remember(access, user) {
  seen.set(sha(access), { user, until: Date.now() + 60_000 });
  if (seen.size > 2000) for (const [k, v] of seen) if (v.until < Date.now()) seen.delete(k);
}
export const slimUser = (u) => ({
  id: u.id,
  email: u.email || '',
  provider: u.app_metadata?.provider || 'email',
  createdAt: u.created_at || null,
});

export function setSession(req, ctx, s) {
  ctx.cookies.push(cookie(req, AT, s.access, Math.max(60, s.expiresIn - 60)), cookie(req, RT, s.refresh, RT_AGE));
  ctx.access = s.access;
  if (s.user?.id) {
    remember(s.access, s.user);
    ctx.user = slimUser(s.user);
  }
}
export function clearSession(req, ctx) {
  ctx.cookies.push(cookie(req, AT, '', 0), cookie(req, RT, '', 0));
  ctx.user = null;
  ctx.access = null;
}

// 지금 로그인한 회원(없으면 null). 한 요청 안에서는 한 번만 확인한다
export async function currentUser(req, ctx) {
  if (ctx.user !== undefined) return ctx.user;
  const c = parseCookies(req);
  let user = null;
  if (c[AT]) {
    const hit = seen.get(sha(c[AT]));
    if (hit && hit.until > Date.now()) user = hit.user;
    else {
      user = await userOf(c[AT]);
      if (user) remember(c[AT], user);
    }
    if (user) ctx.access = c[AT];
  }
  if (!user && c[RT]) {
    const s = await refresh(c[RT]);
    if (s) {
      setSession(req, ctx, s);
      user = s.user?.id ? s.user : await userOf(s.access);
    } else {
      clearSession(req, ctx);
    }
  }
  ctx.user = user ? slimUser(user) : null;
  return ctx.user;
}

// 소셜 로그인용 PKCE — 확인 값(verifier)은 쿠키에, 해시(challenge)만 Supabase 로
export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}
// 로그인 뒤 돌아갈 곳 — 우리 사이트 안의 경로만
export const safeNext = (p) => (typeof p === 'string' && /^\/(?![\\/])[\w\-./?=&%#]*$/.test(p) && !p.startsWith('/api/') ? p : '/');
