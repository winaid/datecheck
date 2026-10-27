// 2026-10-27 로그인·약관 동의·계정별 한도·조회 기록 — 가짜 Supabase(로그인 서버·데이터베이스)로 네트워크 없이
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../lib/token.mjs';
import { safeNext } from '../lib/auth.mjs';

const SB = 'https://fake.supabase.co';
process.env.SUPABASE_URL = SB;
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const { handle } = await import('../lib/app.mjs');

// ---------- 가짜 Supabase ----------
const USERS = { 'at-alice': { id: 'u-alice', email: 'alice@example.com', app_metadata: { provider: 'email' }, created_at: '2026-10-27T00:00:00Z' }, 'at-bob': { id: 'u-bob', email: 'bob@example.com', app_metadata: { provider: 'google' }, created_at: '2026-10-27T00:00:00Z' } };
const DB = { consents: [], reports: [], requests: [], usage: 0 };
const seen = [];
let quotaAnswer = 0;
let googleOn = true;
const reply = (status, body, headers = {}) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const session = (at, user) => ({ access_token: at, refresh_token: `rt-${at}`, expires_in: 3600, user });
const eqOf = (u, k) => (u.searchParams.get(k) || '').replace(/^(eq|gt|gte)\./, '');
before(() => {
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(String(input));
    if (u.origin !== SB) throw new Error(`바깥 호출 금지: ${u}`);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const auth = String(init.headers?.Authorization || '').replace('Bearer ', '');
    seen.push(`${method} ${u.pathname}`);
    if (u.pathname.startsWith('/auth/v1/token')) DB.lastFwd = init.headers['Sb-Forwarded-For'];
    // 로그인 서버
    if (u.pathname === '/auth/v1/settings') return reply(200, { external: { email: true, google: googleOn, kakao: false }, mailer_autoconfirm: true });
    if (u.pathname === '/auth/v1/user' && method === 'GET') return USERS[auth] ? reply(200, USERS[auth]) : reply(401, { error_code: 'bad_jwt' });
    if (u.pathname === '/auth/v1/token') {
      const g = u.searchParams.get('grant_type');
      if (g === 'password') return body.password === 'right-pass1' && body.email === 'alice@example.com' ? reply(200, session('at-alice', USERS['at-alice'])) : reply(400, { error_code: 'invalid_credentials' });
      if (g === 'refresh_token') return body.refresh_token === 'rt-at-alice' ? reply(200, session('at-alice', USERS['at-alice'])) : reply(400, { error_code: 'refresh_token_not_found' });
      if (g === 'pkce') return body.auth_code === 'good-code' && body.code_verifier ? reply(200, session('at-bob', USERS['at-bob'])) : reply(400, { error_code: 'flow_state_not_found' });
    }
    if (u.pathname === '/auth/v1/signup') {
      const user = { id: 'u-new', email: body.email, app_metadata: { provider: 'email' }, created_at: '2026-10-27T00:00:00Z' };
      USERS['at-new'] = user;
      return reply(200, session('at-new', user));
    }
    if (u.pathname === '/auth/v1/logout') return reply(204);
    if (u.pathname.startsWith('/auth/v1/admin/users/')) { DB.deleted = decodeURIComponent(u.pathname.split('/').pop()); return reply(200, {}); }
    // 데이터베이스(비밀 키만)
    if (u.pathname.startsWith('/rest/v1/')) {
      assert.equal(init.headers.apikey, 'sb_secret_test', '데이터베이스는 비밀 키로만');
      const table = u.pathname.slice('/rest/v1/'.length);
      if (table === 'rpc/take_quota') { DB.usage += quotaAnswer ? 0 : 1; return reply(200, quotaAnswer); }
      if (table === 'consents') {
        if (method === 'POST') { if (!DB.consents.some((c) => c.user_id === body.user_id && c.version === body.version)) DB.consents.push(body); return reply(201); }
        return reply(200, DB.consents.filter((c) => c.user_id === eqOf(u, 'user_id') && c.version === eqOf(u, 'version')));
      }
      if (table === 'reports') {
        if (method === 'POST') { DB.reports.push({ ...body, created_at: new Date().toISOString() }); return reply(201); }
        const mine = DB.reports.filter((r) => r.user_id === eqOf(u, 'user_id') && (!u.searchParams.get('id') || r.id === eqOf(u, 'id')));
        if (method === 'DELETE') { DB.reports = DB.reports.filter((r) => !mine.includes(r)); return reply(200, mine.map((r) => ({ id: r.id }))); }
        return reply(200, mine);
      }
      if (table === 'usage_hits') return reply(200, [], { 'content-range': `0-0/${DB.usage}` });
      if (table === 'requests') { DB.requests.push(body); return reply(201); }
    }
    return reply(404, { message: `가짜 Supabase 에 없는 주소 ${method} ${u.pathname}` });
  };
});

// ---------- Vercel 요청 흉내 ----------
function call(method, url, body, headers = {}) {
  return new Promise((resolve) => {
    const req = { method, url, headers: { host: 'datecheck.vercel.app', 'x-forwarded-proto': 'https', ...headers }, body, on() {} };
    const res = {
      writeHead(code, h) { this.code = code; this.h = h || {}; },
      end(data) {
        let json = null;
        try { json = JSON.parse(String(data || '{}')); } catch { json = null; }
        resolve({ code: this.code, json, location: this.h.Location, cookies: [].concat(this.h['Set-Cookie'] || []) });
      },
    };
    handle(req, res);
  });
}
const as = (at) => ({ cookie: `dc_at=${at}` });

test('로그인하지 않으면 조회 401(login), 약관 동의가 없으면 403(consent)', async () => {
  const a = await call('POST', '/api/index?__path=analyze', { attest: true, input: { account: '1101234567890' } });
  assert.equal(a.code, 401);
  assert.equal(a.json.login, true);
  const b = await call('POST', '/api/index?__path=analyze', { attest: true, input: { account: '1101234567890' } }, as('at-alice'));
  assert.equal(b.code, 403);
  assert.equal(b.json.consent, true);
});

test('동의는 세 칸 모두 체크해야 저장되고, 저장 뒤에는 /api/me 가 동의로 알린다', async () => {
  assert.equal((await call('POST', '/api/index?__path=consent', { agree: { age: true, terms: true } }, as('at-alice'))).code, 400);
  assert.equal((await call('POST', '/api/index?__path=consent', { agree: { age: true, terms: true, privacy: true } }, as('at-alice'))).code, 200);
  const me = await call('GET', '/api/index?__path=me', undefined, as('at-alice'));
  assert.equal(me.json.user.email, 'alice@example.com');
  assert.equal(me.json.consent, true);
  assert.equal(me.json.user.id, undefined, '회원 고유 번호는 화면에 주지 않는다');
});

test('조회: 확인 체크(attest) 없으면 거절, 있으면 결과를 암호화해 내 계정에 30일', async () => {
  assert.equal((await call('POST', '/api/index?__path=analyze', { input: { account: '1101234567890' } }, as('at-alice'))).code, 400);
  assert.equal((await call('POST', '/api/index?__path=analyze', { attest: true, input: {} }, as('at-alice'))).code, 400);
  const r = await call('POST', '/api/index?__path=analyze', { attest: true, input: { account: '1101234567890', bank: 'KB국민' } }, as('at-alice'));
  assert.equal(r.code, 200);
  assert.ok(r.json.report.items.find((i) => i.id === 'account').checkable);
  assert.ok(r.json.report.casefile, '신고용 정리본은 늘 들어 있다');
  assert.equal(r.json.report.offers, undefined, '값·결제 제안은 없다');
  const row = DB.reports.find((x) => x.id === r.json.id);
  assert.equal(row.user_id, 'u-alice');
  assert.deepEqual(row.checked, ['account']);
  assert.ok(!row.sealed.includes('1101234567890'), '데이터베이스에는 암호화된 봉투만');
  assert.equal(open(row.sealed).user, 'u-alice');
  const days = (Date.parse(row.expires_at) - Date.now()) / 86400_000;
  assert.ok(days > 29.9 && days <= 30, `보관 ${days}일`);
});

test('조회 기록은 조회한 계정에서만 열리고, 목록·지우기도 내 것만', async () => {
  const id = DB.reports.find((x) => x.user_id === 'u-alice').id;
  assert.equal((await call('POST', '/api/index?__path=report', { id }, as('at-alice'))).code, 200);
  assert.equal((await call('POST', '/api/index?__path=report', { id }, as('at-bob'))).code, 404);
  const list = await call('GET', '/api/index?__path=reports', undefined, as('at-alice'));
  assert.equal(list.json.reports[0].id, id);
  assert.equal(list.json.reports[0].sealed, undefined, '목록에 봉투를 싣지 않는다');
  assert.equal((await call('POST', '/api/index?__path=report/delete', { id }, as('at-bob'))).json.deleted, 0);
  assert.equal((await call('POST', '/api/index?__path=report/delete', { id }, as('at-alice'))).json.deleted, 1);
  assert.equal((await call('POST', '/api/index?__path=report', { id }, as('at-alice'))).code, 404);
});

test('계정 한도: 10분 한도·24시간 한도에 걸리면 429 와 쉬운 안내', async () => {
  try {
    quotaAnswer = 600;
    const a = await call('POST', '/api/index?__path=analyze', { attest: true, input: { account: '1101234567890' } }, as('at-alice'));
    assert.equal(a.code, 429);
    assert.match(a.json.error, /10분에 10번/);
    quotaAnswer = 86400;
    const b = await call('POST', '/api/index?__path=analyze', { attest: true, input: { account: '1101234567890' } }, as('at-alice'));
    assert.match(b.json.error, /24시간에 30번/);
  } finally {
    quotaAnswer = 0;
  }
});

test('이메일 로그인: 맞으면 쿠키 두 개(httpOnly·Secure), 틀리면 쉬운 말', async () => {
  const bad = await call('POST', '/api/index?__path=auth/login', { email: 'alice@example.com', password: 'nope' });
  assert.equal(bad.code, 400);
  assert.match(bad.json.error, /이메일이나 비밀번호가 맞지 않아요/);
  const ok = await call('POST', '/api/index?__path=auth/login', { email: 'Alice@Example.com', password: 'right-pass1' }, { 'x-real-ip': '203.0.113.7' });
  assert.equal(DB.lastFwd, '203.0.113.7', '로그인 서버에 이용자 주소를 넘긴다(횟수 제한을 이용자별로)');
  assert.equal(ok.code, 200);
  const at = ok.cookies.find((c) => c.startsWith('dc_at='));
  const rt = ok.cookies.find((c) => c.startsWith('dc_rt='));
  for (const c of [at, rt]) { assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Secure/); }
  assert.match(rt, /Max-Age=2592000/);
  assert.equal(JSON.stringify(ok.json).includes('at-alice'), false, '토큰은 본문에 싣지 않는다');
});

test('가입: 비밀번호 규칙·동의 세 칸, 가입하면 동의를 바로 저장하고 로그인', async () => {
  const agree = { age: true, terms: true, privacy: true };
  assert.match((await call('POST', '/api/index?__path=auth/signup', { email: 'new@example.com', password: 'short1', agree })).json.error, /8자 이상/);
  assert.match((await call('POST', '/api/index?__path=auth/signup', { email: 'new@example.com', password: 'onlyletters', agree })).json.error, /영문과 숫자/);
  assert.match((await call('POST', '/api/index?__path=auth/signup', { email: 'new@example.com', password: 'good-pass1', agree: { age: true } })).json.error, /만 14세/);
  const ok = await call('POST', '/api/index?__path=auth/signup', { email: 'new@example.com', password: 'good-pass1', agree });
  assert.equal(ok.code, 200);
  assert.ok(ok.cookies.some((c) => c.startsWith('dc_at=at-new')));
  assert.ok(DB.consents.some((c) => c.user_id === 'u-new'));
});

test('접속 토큰이 만료되면 갱신 토큰으로 새로 받아 쿠키를 바꿔 준다', async () => {
  const r = await call('GET', '/api/index?__path=me', undefined, { cookie: 'dc_at=expired; dc_rt=rt-at-alice' });
  assert.equal(r.json.user.email, 'alice@example.com');
  assert.ok(r.cookies.some((c) => c.startsWith('dc_at=at-alice')));
  const gone = await call('GET', '/api/index?__path=me', undefined, { cookie: 'dc_at=expired; dc_rt=rt-wrong' });
  assert.equal(gone.json.user, null);
  assert.ok(gone.cookies.some((c) => c.startsWith('dc_rt=;') && /Max-Age=0/.test(c)), '못 쓰는 갱신 토큰은 지운다');
});

test('구글 로그인: PKCE 로 Supabase 에 보냈다가, 돌아오면 로그인하고 원래 자리로', async () => {
  const go = await call('GET', '/api/index?__path=auth/oauth&provider=google&next=%2Freport%2Fabcdefgh1234');
  assert.equal(go.code, 302);
  const to = new URL(go.location);
  assert.equal(to.origin + to.pathname, `${SB}/auth/v1/authorize`);
  assert.equal(to.searchParams.get('provider'), 'google');
  assert.equal(to.searchParams.get('code_challenge_method'), 's256');
  assert.equal(to.searchParams.get('redirect_to'), 'https://datecheck.vercel.app/api/auth/callback');
  const pk = go.cookies.find((c) => c.startsWith('dc_pkce='));
  assert.match(pk, /Path=\/api\/auth/);
  const verifier = pk.split(';')[0].split('=')[1];
  const back = await call('GET', '/api/index?__path=auth/callback&code=good-code', undefined, { cookie: `dc_pkce=${verifier}; dc_next=%2Freport%2Fabcdefgh1234` });
  assert.equal(back.code, 302);
  assert.equal(back.location, '/report/abcdefgh1234?login=1');
  assert.ok(back.cookies.some((c) => c.startsWith('dc_at=at-bob')));
  // 쿠키 없이 돌아오거나 코드가 틀리면 로그인하지 않는다
  assert.equal((await call('GET', '/api/index?__path=auth/callback&code=good-code')).location, '/?login_error=cancel');
  assert.equal((await call('GET', '/api/index?__path=auth/callback&code=bad', undefined, { cookie: 'dc_pkce=x' })).location, '/?login_error=expired');
  // 꺼 둔 로그인 방법은 보내지 않는다
  assert.equal((await call('GET', '/api/index?__path=auth/oauth&provider=kakao')).location, '/?login_error=provider');
});

test('로그인 뒤 돌아갈 곳은 우리 사이트 안 경로만', () => {
  assert.equal(safeNext('/my'), '/my');
  assert.equal(safeNext('/?start=1'), '/?start=1');
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/api/auth/logout', 'javascript:alert(1)', '']) assert.equal(safeNext(bad), '/', bad);
});

test('다른 사이트에서 보낸 요청(Origin 이 다름)은 쿠키가 있어도 받지 않는다', async () => {
  const r = await call('POST', '/api/index?__path=report/delete', { id: 'abcdefgh1234' }, { ...as('at-alice'), origin: 'https://evil.example' });
  assert.equal(r.code, 403);
  const same = await call('POST', '/api/index?__path=report/delete', { id: 'abcdefgh1234' }, { ...as('at-alice'), origin: 'https://datecheck.vercel.app' });
  assert.equal(same.code, 200);
});

test('삭제 요청·문의는 로그인 없이도 받는다(조회된 번호의 주인도 요청할 수 있게)', async () => {
  const r = await call('POST', '/api/index?__path=request', { type: 'delete', message: '제 번호가 조회됐다면 지워 주세요', contact: 'x@example.com' });
  assert.equal(r.code, 200);
  assert.equal(DB.requests.at(-1).type, 'delete');
  assert.equal(DB.requests.at(-1).user_id, null);
});

test('회원 탈퇴: 체크해야 하고, 탈퇴하면 Supabase 에서 회원을 지우고 쿠키를 지운다', async () => {
  assert.equal((await call('POST', '/api/index?__path=me/delete', {}, as('at-bob'))).code, 400);
  const r = await call('POST', '/api/index?__path=me/delete', { confirm: true }, as('at-bob'));
  assert.equal(r.code, 200);
  assert.equal(DB.deleted, 'u-bob');
  assert.ok(r.cookies.some((c) => c.startsWith('dc_at=;')));
});

test('설정에 켜진 로그인 방법과 한도를 싣는다', async () => {
  const c = await call('GET', '/api/index?__path=config');
  assert.equal(c.json.auth.google, true);
  assert.equal(c.json.auth.kakao, false);
  assert.equal(c.json.quota.perDay, 30);
  assert.equal(c.json.retentionDays, 30);
  assert.equal(c.json.plans, undefined);
});
