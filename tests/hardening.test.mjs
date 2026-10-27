// 2026-10-27 전체 점검에서 고친 것들의 회귀 시험
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal } from '../lib/token.mjs';
import { handle, rateLimited } from '../lib/app.mjs';
import { CHECKS, finalize } from '../lib/analyze.mjs';
import { accountPart } from '../lib/sources.mjs';
import { adminStats } from '../lib/store.mjs';

function call(method, url, body, headers = {}) {
  return new Promise((resolve) => {
    const req = { method, url, headers, body, on() {} };
    const res = {
      writeHead(code, h) { this.code = code; this.headers = h; },
      end(data) { resolve({ code: this.code, json: JSON.parse(String(data || '{}')) }); },
    };
    handle(req, res);
  });
}
const def = (id) => CHECKS.find((c) => c.id === id);

test("확인한 사실이 없으면 '특이사항 없음'이 아니라 '직접 확인 필요'(manual)", async () => {
  const acc = await accountPart('110-123-456789', 'KB국민');
  assert.equal(finalize(def('account'), true, acc).status, 'manual');
  assert.equal(finalize(def('job'), true, { facts: [{ tip: true, text: '안내' }] }).status, 'manual');
  assert.equal(finalize(def('job'), true, { facts: [{ text: '찾은 사실' }] }).status, 'clear');
  assert.equal(finalize(def('job'), true, { pending: [{ label: 'x', text: 'y' }] }).status, 'pending');
  assert.equal(finalize(def('job'), true, { pending: [{ label: 'x', text: 'y', retry: true }] }).status, 'retry');
});

test('진술 불일치는 대화만 있어도 검사한다(대화 속 말끼리)', () => {
  assert.equal(def('mismatch').needs({ chat: '상대: 안녕' }), true);
  assert.equal(def('mismatch').needs({ chat: '' , company: '삼성' }), false);
});

test('횟수 제한: 정한 횟수까지 받고 그다음은 막는다, 주소가 다르면 따로 센다', () => {
  const rule = { max: 3, windowMs: 60_000 };
  for (let i = 0; i < 3; i += 1) assert.equal(rateLimited('t', '1.1.1.1', rule), false);
  assert.equal(rateLimited('t', '1.1.1.1', rule), true);
  assert.equal(rateLimited('t', '2.2.2.2', rule), false);
});

test('로그인 시도는 같은 주소에서 10분에 20번까지', async () => {
  const h = { 'x-real-ip': '9.9.9.9' };
  for (let i = 0; i < 20; i += 1) assert.equal((await call('POST', '/api/index?__path=auth/login', { email: 'x' }, h)).code, 400);
  const r = await call('POST', '/api/index?__path=auth/login', { email: 'x' }, h);
  assert.equal(r.code, 429);
  assert.match(r.json.error, /10분쯤 뒤/);
});

test('화면 이벤트로 가입·조회 수를 부풀릴 수 없고, 복사·인쇄 이벤트는 센다', async () => {
  const ev = () => ({ ...(adminStats().today?.events || {}) });
  const before = { ...ev() };
  await call('POST', '/api/index?__path=event', { type: 'signup' });
  await call('POST', '/api/index?__path=event', { type: 'inputs_done' });
  await call('POST', '/api/index?__path=event', { type: 'copy' });
  const after = ev();
  assert.equal(after.signup || 0, before.signup || 0);
  assert.equal(after.inputs_done || 0, before.inputs_done || 0);
  assert.equal((after.copy || 0), (before.copy || 0) + 1);
});

test('관리자 키: 한글·다른 길이도 500 없이 401, 열 번 넘게 틀리면 429', async () => {
  const keep = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = 'test-admin-key';
  try {
    const h = { 'x-admin-key': '한글키', 'x-real-ip': '8.8.8.8' };
    assert.equal((await call('GET', '/api/index?__path=admin/stats', undefined, h)).code, 401);
    for (let i = 0; i < 9; i += 1) await call('GET', '/api/index?__path=admin/stats', undefined, h);
    assert.equal((await call('GET', '/api/index?__path=admin/stats', undefined, h)).code, 429);
    assert.equal((await call('GET', '/api/index?__path=admin/stats', undefined, { 'x-admin-key': 'test-admin-key', 'x-real-ip': '7.7.7.7' })).code, 200);
  } finally {
    if (keep === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = keep;
  }
});

test('미리 읽힌 본문에도 크기 한도를 건다', async () => {
  const r = await call('POST', '/api/index?__path=event', { type: 'copy', pad: 'x'.repeat(5000) });
  assert.equal(r.code, 413);
});

test('운영에서는 REPORT_SECRET 없이 봉투를 만들지 않는다', () => {
  const keep = { env: process.env.VERCEL_ENV, secret: process.env.REPORT_SECRET };
  process.env.VERCEL_ENV = 'production';
  delete process.env.REPORT_SECRET;
  try {
    assert.throws(() => seal({ id: 'x' }), /REPORT_SECRET/);
    process.env.REPORT_SECRET = 'set';
    assert.ok(seal({ id: 'x' }));
  } finally {
    if (keep.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = keep.env;
    if (keep.secret === undefined) delete process.env.REPORT_SECRET; else process.env.REPORT_SECRET = keep.secret;
  }
});
