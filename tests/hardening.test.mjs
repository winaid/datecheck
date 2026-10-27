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
const result = { items: [], totals: { total: 13, checkable: 0, signals: 0, notes: 0 }, meta: { notes: [], ocrLines: 0, ai: false }, subject: {} };
const preview = (id) => seal({ v: 1, id, result, createdAt: Date.now(), exp: Date.now() + 60_000, plan: null, fullPrice: 7900 });
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

test('점검 요청은 같은 주소에서 10분에 12번까지', async () => {
  const h = { 'x-real-ip': '9.9.9.9' };
  for (let i = 0; i < 12; i += 1) assert.equal((await call('POST', '/api/index?__path=analyze', { input: {} }, h)).code, 400);
  const r = await call('POST', '/api/index?__path=analyze', { input: {} }, h);
  assert.equal(r.code, 429);
  assert.match(r.json.error, /10분쯤 뒤/);
});

test('화면 이벤트로 결제 수를 부풀릴 수 없고, 복사·인쇄 이벤트는 센다', async () => {
  const ev = () => ({ ...(adminStats().today?.events || {}) });
  const before = { ...ev() };
  await call('POST', '/api/index?__path=event', { type: 'paid_full' });
  await call('POST', '/api/index?__path=event', { type: 'copy' });
  const after = ev();
  assert.equal(after.paid_full || 0, before.paid_full || 0);
  assert.equal((after.copy || 0), (before.copy || 0) + 1);
});

test('재검사 할인은 처음 정밀 분석을 산 때부터 24시간 — 재검사로 산 리포트로 이어지지 않는다', async () => {
  const now = Date.now();
  const fresh = seal({ v: 1, id: 'orig', result, createdAt: now, exp: now + 3_600_000, plan: 'full', paidAt: now - 2 * 3_600_000, fullPaidAt: now - 2 * 3_600_000 });
  const ok = await call('POST', '/api/index?__path=pay', { token: preview('rc1'), plan: 'full', recheckToken: fresh });
  assert.equal(ok.json.report.fullPaidAt, now - 2 * 3_600_000); // 재검사 값 — 처음 산 때를 물려받는다
  const stale = seal({ v: 1, id: 'chain', result, createdAt: now, exp: now + 3_600_000, plan: 'full', paidAt: now - 3_600_000, fullPaidAt: now - 25 * 3_600_000 });
  const no = await call('POST', '/api/index?__path=pay', { token: preview('rc2'), plan: 'full', recheckToken: stale });
  assert.ok(no.json.report.fullPaidAt >= now); // 재검사 아님 — 새 정밀 분석
  // 처음 산 지 24시간이 지난 리포트에는 재검사 제안을 내지 않는다
  const opened = await call('POST', '/api/index?__path=report', { token: stale });
  assert.equal(opened.json.offers.recheck, null);
});

test('이미 연 리포트로 결제를 다시 불러도 보관 시간이 늘지 않는다', async () => {
  const first = await call('POST', '/api/index?__path=pay', { token: preview('keep1'), plan: 'free' });
  await new Promise((r) => setTimeout(r, 15));
  const again = await call('POST', '/api/index?__path=pay', { token: first.json.reportToken, plan: 'free' });
  assert.equal(again.json.expiresAt, first.json.expiresAt);
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
