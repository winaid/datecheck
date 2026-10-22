// Vercel 함수 방식 시험 — 리포트 봉투, __path 로 넘어온 주소, 미리 읽힌 본문(req.body)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open } from '../lib/token.mjs';
import { handle } from '../lib/app.mjs';

// Vercel 의 req/res 흉내: 본문은 이미 읽혀 req.body 로 들어온다
function call(method, url, body) {
  return new Promise((resolve) => {
    const req = { method, url, headers: {}, body, on() {} };
    const res = {
      writeHead(code, headers) { this.code = code; this.headers = headers; },
      end(data) { resolve({ code: this.code, json: JSON.parse(String(data || '{}')) }); },
    };
    handle(req, res);
  });
}

test('봉투: 그대로 열리고, 한 글자만 바꿔도 안 열린다', () => {
  const t = seal({ id: 'abc', plan: 'standard', result: { items: [] } });
  assert.equal(open(t).id, 'abc');
  const bad = `${t.slice(0, -2)}${t.endsWith('A') ? 'BB' : 'AA'}`;
  assert.equal(open(bad), null);
  assert.equal(open('아무거나'), null);
});

test('__path 로 넘어온 주소를 원래 API 로 처리한다', async () => {
  const r = await call('GET', '/api/index?__path=config');
  assert.equal(r.code, 200);
  assert.equal(r.json.checks.length, 13);
});

test('결제: 봉투로 요금제를 열고, 기한이 지난 봉투는 거절한다', async () => {
  const result = { items: [], totals: { total: 13, checkable: 0, signals: 0, notes: 0 }, meta: { notes: [], ocrLines: 0, ai: false } };
  const fresh = seal({ v: 1, id: 'r1', result, createdAt: Date.now(), exp: Date.now() + 60_000, plan: null });
  // 예전 Standard 요청은 무료 점검으로 연다
  const paid = await call('POST', '/api/index?__path=pay', { token: fresh, plan: 'standard' });
  assert.equal(paid.code, 200);
  assert.equal(paid.json.report.plan, 'free');
  assert.ok(paid.json.report.offers.casefile > 0);
  const view = await call('POST', '/api/index?__path=report', { token: paid.json.reportToken });
  assert.equal(view.code, 200);
  assert.equal(view.json.id, 'r1');
  const unpaid = await call('POST', '/api/index?__path=report', { token: fresh });
  assert.equal(unpaid.code, 402);
  const old = seal({ v: 1, id: 'r2', result, createdAt: 0, exp: Date.now() - 1, plan: 'full' });
  assert.equal((await call('POST', '/api/index?__path=report', { token: old })).code, 410);
});

test('정밀 분석·신고용 정리본·재검사 값', async () => {
  const result = { items: [], totals: { total: 13, checkable: 0, signals: 0, notes: 0 }, meta: { notes: [], ocrLines: 0, ai: false }, subject: {} };
  const mk = (id) => seal({ v: 1, id, result, createdAt: Date.now(), exp: Date.now() + 60_000, plan: null, fullPrice: 7900 });
  const full = await call('POST', '/api/index?__path=pay', { token: mk('f1'), plan: 'full', visitor: 'abcdef1234' });
  assert.equal(full.json.report.plan, 'full');
  assert.ok(full.json.report.offers.recheck > 0);
  const cf = await call('POST', '/api/index?__path=pay', { token: full.json.reportToken, addon: 'casefile' });
  assert.ok(cf.json.report.casefile);
  assert.equal(cf.json.report.offers.casefile, null);
  // 24시간 안에 정밀 분석을 받은 봉투가 있으면 다른 점검은 재검사 값
  const re = await call('POST', '/api/index?__path=pay', { token: mk('f2'), plan: 'full', recheckToken: full.json.reportToken });
  assert.equal(re.code, 200);
  assert.equal(re.json.report.plan, 'full');
  // 결제 전 봉투로는 정리본을 살 수 없다
  assert.equal((await call('POST', '/api/index?__path=pay', { token: mk('f3'), addon: 'casefile' })).code, 402);
});
