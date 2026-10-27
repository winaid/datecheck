// Supabase — 로그인(Auth)과 데이터베이스(PostgREST)를 우리 서버에서만 부른다. 브라우저에는 키도 라이브러리도 보내지 않는다.
// 공개 키(publishable)는 로그인 요청에, 비밀 키(secret)는 표 읽기·쓰기와 회원 삭제에만 쓴다(2026-10-27)
import { AsyncLocalStorage } from 'node:async_hooks';

// 지금 처리 중인 요청의 이용자 접속 주소 — 로그인 서버가 횟수 제한을 우리 서버 주소 하나로 묶지 않고 이용자마다 세게
// Sb-Forwarded-For 로 넘긴다(Supabase 설정 security_sb_forwarded_for_enabled 를 켜 둠). app.mjs handle 이 요청마다 채운다
export const requestScope = new AsyncLocalStorage();
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const pubKey = () => process.env.SUPABASE_PUBLISHABLE_KEY || '';
const secKey = () => process.env.SUPABASE_SECRET_KEY || '';
export const supaReady = () => Boolean(base() && pubKey() && secKey());

const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const DOWN = '로그인 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

async function call(path, { method = 'GET', body, secret = false, bearer, headers = {}, timeout = 8000 } = {}) {
  if (!supaReady()) throw fail(503, '로그인 기능을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.');
  const h = { apikey: secret ? secKey() : pubKey(), ...headers };
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  const ip = requestScope.getStore()?.ip;
  if (ip && path.startsWith('/auth/')) h['Sb-Forwarded-For'] = ip;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(base() + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
  } catch {
    throw fail(503, DOWN);
  } finally {
    clearTimeout(timer);
  }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, ok: r.ok, data, headers: r.headers };
}

// ---------- 로그인 ----------
// Supabase 오류 코드 → 쉬운 말. 모르는 코드는 일반 안내로
const AUTH_MSG = {
  invalid_credentials: '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요.',
  email_not_confirmed: '메일함에서 이메일 확인 링크를 먼저 눌러 주세요.',
  user_already_exists: '이미 가입한 이메일이에요. 로그인해 주세요.',
  email_exists: '이미 가입한 이메일이에요. 로그인해 주세요.',
  weak_password: '비밀번호가 너무 쉬워요. 영문과 숫자를 섞어 8자 이상으로 정해 주세요.',
  email_address_invalid: '이메일 주소 모양이 맞지 않아요. 다시 확인해 주세요.',
  validation_failed: '입력한 내용을 다시 확인해 주세요.',
  over_email_send_rate_limit: '메일을 짧은 시간에 여러 번 보냈어요. 잠시 뒤 다시 시도해 주세요.',
  over_request_rate_limit: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
  signup_disabled: '지금은 새로 가입할 수 없어요.',
  otp_expired: '링크가 만료됐거나 이미 쓴 링크예요. 다시 요청해 주세요.',
  flow_state_not_found: '로그인 시간이 지났어요. 처음부터 다시 시도해 주세요.',
  flow_state_expired: '로그인 시간이 지났어요. 처음부터 다시 시도해 주세요.',
  bad_code_verifier: '로그인 시간이 지났어요. 처음부터 다시 시도해 주세요.',
  same_password: '지금 쓰는 비밀번호와 같아요. 다른 비밀번호로 정해 주세요.',
  email_address_not_authorized: '지금은 이 주소로 메일을 보낼 수 없어요. 화면 맨 아래 ‘삭제 요청·문의·신고’로 알려 주세요.',
};
function authError(r, fallback = '로그인 중에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.') {
  const code = r.data?.error_code || r.data?.code || r.data?.error || '';
  const msg = AUTH_MSG[code] || (r.status === 429 ? AUTH_MSG.over_request_rate_limit : fallback);
  return fail(r.status === 429 ? 429 : r.status >= 500 ? 503 : 400, msg, { authCode: String(code) });
}
const session = (d) => (d?.access_token ? { access: d.access_token, refresh: d.refresh_token, expiresIn: Number(d.expires_in) || 3600, user: d.user || null } : null);

export async function signUp(email, password) {
  const r = await call('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!r.ok) throw authError(r);
  // 메일 확인을 켜 두면 세션 없이 회원만 돌아온다
  return { session: session(r.data), user: r.data?.user || (r.data?.id ? r.data : null) };
}
export async function signIn(email, password) {
  const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!r.ok) throw authError(r);
  return session(r.data);
}
export async function refresh(refreshToken) {
  const r = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
  return r.ok ? session(r.data) : null;
}
export async function exchangeCode(code, verifier) {
  const r = await call('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: verifier } });
  if (!r.ok) throw authError(r);
  return session(r.data);
}
export async function verifyLink(tokenHash, type) {
  const r = await call('/auth/v1/verify', { method: 'POST', body: { token_hash: tokenHash, type } });
  if (!r.ok) throw authError(r);
  return session(r.data);
}
// 접속 토큰으로 회원 확인 — 만료·위조면 null
export async function userOf(access) {
  const r = await call('/auth/v1/user', { bearer: access, timeout: 6000 });
  if (r.ok && r.data?.id) return r.data;
  if (r.status === 401 || r.status === 403) return null;
  throw fail(503, DOWN);
}
export async function signOut(access) {
  await call('/auth/v1/logout?scope=local', { method: 'POST', bearer: access }).catch(() => null);
}
export async function sendRecovery(email) {
  const r = await call('/auth/v1/recover', { method: 'POST', body: { email } });
  if (!r.ok) throw authError(r);
}
export async function setPassword(access, password) {
  const r = await call('/auth/v1/user', { method: 'PUT', bearer: access, body: { password } });
  if (!r.ok) throw authError(r);
}
export async function deleteUser(id) {
  const r = await call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', secret: true });
  if (!r.ok && r.status !== 404) throw fail(503, '회원 탈퇴를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
}
export const authorizeUrl = (provider, redirectTo, challenge) => `${base()}/auth/v1/authorize?${new URLSearchParams({ provider, redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256' })}`;

// 켜진 로그인 방법(구글·카카오) — 5분 동안 기억
let settingsCache = { at: 0, v: null };
export async function providers() {
  if (settingsCache.v && Date.now() - settingsCache.at < 300_000) return settingsCache.v;
  try {
    const r = await call('/auth/v1/settings', { timeout: 4000 });
    const ex = r.data?.external || {};
    settingsCache = { at: Date.now(), v: { email: ex.email !== false, google: Boolean(ex.google), kakao: Boolean(ex.kakao), confirmEmail: r.data?.mailer_autoconfirm === false } };
  } catch {
    return settingsCache.v || { email: true, google: false, kakao: false, confirmEmail: false };
  }
  return settingsCache.v;
}

// ---------- 데이터베이스 (비밀 키) ----------
const q = (params) => new URLSearchParams(params).toString();
async function rest(path, opts) {
  const r = await call(`/rest/v1/${path}`, { secret: true, ...opts });
  if (!r.ok) throw fail(503, '저장 서버가 잠시 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', { db: r.status, detail: typeof r.data === 'object' ? r.data?.message : '' });
  return r;
}
export const db = {
  async select(table, params) { return (await rest(`${table}?${q(params)}`)).data || []; },
  async insert(table, row) { await rest(table, { method: 'POST', body: row, headers: { Prefer: 'return=minimal' } }); },
  async upsert(table, row) { await rest(table, { method: 'POST', body: row, headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } }); },
  async update(table, params, patch) { return (await rest(`${table}?${q(params)}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } })).data || []; },
  async remove(table, params) { return (await rest(`${table}?${q(params)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })).data || []; },
  async count(table, params) {
    const r = await rest(`${table}?${q({ select: 'id', ...params })}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    return Number(String(r.headers.get('content-range') || '').split('/')[1]) || 0;
  },
  async rpc(name, args) { return (await rest(`rpc/${name}`, { method: 'POST', body: args })).data; },
};
