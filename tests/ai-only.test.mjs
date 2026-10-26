// 대화 판별은 AI 만 (2026-10-26 오너) — 제미나이·도메인 조회는 가짜 응답으로(네트워크·비용 없이)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis, CHAT_IDS } from '../lib/analyze.mjs';

const realFetch = globalThis.fetch;
const realKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = realKey;
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const geminiSays = (out) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }], usageMetadata: {} });
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
// 제미나이 · IANA 목록 · RDAP 를 흉내 낸다
function fakeNet({ ai, created = daysAgo(40) }) {
  const calls = { gemini: 0 };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('generativelanguage')) {
      calls.gemini += 1;
      if (ai instanceof Error) throw ai;
      return geminiSays(typeof ai === 'function' ? ai(calls.gemini) : ai);
    }
    if (u.includes('data.iana.org')) return json({ services: [[['top', 'xyz'], ['https://rdap.test/']]] });
    if (u.startsWith('https://rdap.test/')) return json({ events: [{ eventAction: 'registration', eventDate: created }] });
    throw new Error(`예상 못 한 요청 ${u}`);
  };
  return calls;
}
const SCAM = '나: 돈 좀 빌려줘\n상대: 출금하려면 수수료를 먼저 입금해야 해\n상대: 신분증 사진 보내줘';
const item = (r, id) => r.items.find((i) => i.id === id);

test('AI 키가 없으면 대화 항목은 판별하지 않는다 — 낱말이 있어도 신호 0, 연동 준비 중', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await runAnalysis({ chatText: SCAM });
  for (const id of ['money', 'invest', 'privacy', 'avoid']) {
    assert.equal(item(r, id).status, 'pending', id);
    assert.equal(item(r, id).signals.length, 0, id);
  }
  assert.equal(r.totals.signals, 0);
});

test('AI 가 응답하지 않으면 한 번 더 묻고, 그래도 안 되면 다시 확인 필요 + 쉬운 안내(규칙으로 대신하지 않음)', async () => {
  process.env.GEMINI_API_KEY = 'test';
  const calls = fakeNet({ ai: new Error('503') });
  const r = await runAnalysis({ chatText: SCAM });
  assert.equal(calls.gemini, 2);
  for (const id of ['money', 'invest', 'privacy', 'avoid']) {
    assert.equal(item(r, id).status, 'retry', id);
    assert.equal(item(r, id).signals.length, 0, id);
  }
  assert.ok(r.meta.notes.some((n) => n.includes('AI 대화 분석이 잠시 응답하지 않아')));
});

test('첫 번째가 실패하고 두 번째가 되면 결과가 나온다', async () => {
  process.env.GEMINI_API_KEY = 'test';
  const ok = { signals: [{ category: 'money', title: '먼저 돈을 내라는 말이 있어요', explanation: '출금 전에 수수료를 먼저 내라고 해요.', evidence: ['수수료를 먼저 입금해야 해'], strength: 'signal' }], hints: {} };
  let n = 0;
  globalThis.fetch = async (url) => {
    if (!String(url).includes('generativelanguage')) throw new Error('x');
    n += 1;
    if (n === 1) return json({ error: 'overloaded' }, 503);
    return geminiSays(ok);
  };
  const r = await runAnalysis({ chatText: SCAM });
  assert.equal(n, 2);
  assert.equal(item(r, 'money').status, 'signal');
});

test('AI 근거는 원문 대조 — 내가 한 말·원문에 없는 말·판정 문구는 버린다', async () => {
  process.env.GEMINI_API_KEY = 'test';
  fakeNet({
    ai: {
      signals: [
        { category: 'money', title: '먼저 돈을 내라는 말이 있어요', explanation: '출금 전에 수수료를 먼저 내라고 해요.', evidence: ['수수료를 먼저 입금해야 해'], strength: 'signal' },
        { category: 'money', title: '돈을 빌려 달라는 말이 있어요', explanation: '돈을 빌려 달라고 해요.', evidence: ['돈 좀 빌려줘'], strength: 'signal' },
        { category: 'invest', title: '투자를 권하는 말이 있어요', explanation: '투자를 권해요.', evidence: ['코인 사면 두 배야'], strength: 'signal' },
        { category: 'privacy', title: '이 사람은 사기꾼이에요', explanation: '신분증을 달라고 해요.', evidence: ['신분증 사진 보내줘'], strength: 'signal' },
        { category: 'privacy', title: '신분증 사진을 달라는 말이 있어요', explanation: '신분증 사진은 보내지 마세요.', evidence: ['신분증 사진 보내줘'], strength: 'signal' },
      ],
      hints: { claimedYears: null, cryptoInvite: false },
    },
  });
  const r = await runAnalysis({ chatText: SCAM });
  assert.equal(item(r, 'money').signals.length, 1, '"나:" 줄 근거는 버림');
  assert.equal(item(r, 'invest').signals.length, 0, '원문에 없는 근거는 버림');
  assert.equal(item(r, 'invest').status, 'clear');
  assert.equal(item(r, 'privacy').signals.length, 1, '판정 문구 신호는 버리고 바른 것만');
  assert.ok(r.items.filter((i) => CHAT_IDS.includes(i.id) && i.signals.length).every((i) => i.signals.every((s) => s.by === 'ai')));
});

test('9번 링크 — 운영 기간·코인 권유는 AI 가 읽은 값으로(낱말 규칙 아님)', async () => {
  process.env.GEMINI_API_KEY = 'test';
  const chat = '상대: 우리 쇼핑몰 5년째 하고 있어\n상대: 여기 거래소 가입해 https://luna-coin.top/join';
  fakeNet({ ai: { signals: [], hints: { claimedYears: 5, cryptoInvite: true } } });
  const on = item(await runAnalysis({ chatText: chat }), 'link');
  assert.ok(on.signals.some((s) => s.title.includes('운영기간 설명과 도메인 생성시점')), JSON.stringify(on.signals.map((s) => s.title)));
  assert.ok(on.signals.some((s) => s.title.includes('신고된 원화 거래소 주소가 아닙니다')));
  // 같은 대화라도 AI 가 '운영 기간 말 없음·권유 아님'으로 읽으면 두 신호는 없다
  fakeNet({ ai: { signals: [], hints: { claimedYears: null, cryptoInvite: false } } });
  const off = item(await runAnalysis({ chatText: chat }), 'link');
  assert.ok(!off.signals.some((s) => /운영기간|원화 거래소/.test(s.title)), JSON.stringify(off.signals.map((s) => s.title)));
});

test('대화 없이 상대가 한 말 + 링크 — 짧게 AI 에 물어 운영 기간을 비교한다', async () => {
  process.env.GEMINI_API_KEY = 'test';
  const calls = fakeNet({ ai: { claimedYears: 3, cryptoInvite: false } });
  const r = await runAnalysis({ url: 'https://lucky-mall.xyz', claims: '쇼핑몰을 3년째 운영 중이라고 했어요' });
  assert.equal(calls.gemini, 1);
  assert.ok(item(r, 'link').signals.some((s) => s.title.includes('운영기간 설명과 도메인 생성시점')));
});
