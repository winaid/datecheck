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
  const t = seal({ id: 'abc', user: 'u1', result: { items: [] } });
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

test('리포트·조회 내역·조회는 로그인해야 열린다(결제 경로는 없다)', async () => {
  for (const [m, p] of [['POST', 'report'], ['GET', 'reports'], ['POST', 'analyze'], ['POST', 'report/delete']]) {
    const r = await call(m, `/api/index?__path=${p}`, m === 'POST' ? { id: 'abcdefgh1234' } : undefined);
    assert.equal(r.code, 401, p);
    assert.equal(r.json.login, true, p);
  }
  assert.equal((await call('POST', '/api/index?__path=pay', { plan: 'full' })).code, 404);
});
