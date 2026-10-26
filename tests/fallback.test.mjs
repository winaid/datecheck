// 2026-10-26 — 심평원 목록 대체 찾기 · '다시 확인 필요' 상태 · 이름 비교 (네트워크 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 공공데이터 키가 없으면 병원은 처음부터 분기 목록으로 찾는다 — 이 시험이 실제 API 를 부르지 않게
delete process.env.DATA_GO_KR_KEY;
const { searchHiraList, asOfText } = await import('../lib/hira-list.mjs');
const { hiraFind, jobPart, busy } = await import('../lib/sources.mjs');
const { finalize, CHECKS } = await import('../lib/analyze.mjs');
const { nameKey } = await import('../public/parse-input.js');

test('이름 비교 — 법인 표시·띄어쓰기·대소문자를 뺀다', () => {
  assert.equal(nameKey('(주)카카오'), nameKey('주식회사 카카오'));
  assert.equal(nameKey('㈜ 브이글로벌'), '브이글로벌');
  assert.equal(nameKey('Coupang Corp.'), 'coupang');
});

test('심평원 목록 — 병원과 약국을 따로 찾고, 이름이 같은 곳이 먼저', () => {
  const h = searchHiraList('서울아산병원');
  assert.ok(h.total >= 1);
  assert.match(h.items[0].name, /서울아산병원/);
  assert.notEqual(h.items[0].kind, '약국');
  const p = searchHiraList('온누리약국', { pharmacy: true });
  assert.ok(p.total > 10);
  assert.ok(p.items.every((x) => x.kind === '약국'));
  assert.equal(searchHiraList('가').total, 0);
  assert.match(asOfText(h.asOf), /^\d{4}년 \d{1,2}월$/);
});

test('병원 찾기 — 진료과를 붙여도 떼고 다시 찾는다, 없는 이름은 0곳', async () => {
  const r = await hiraFind('서울아산병원 성형외과');
  assert.equal(r.src, 'list');
  assert.equal(r.q, '서울아산병원');
  assert.match(r.items[0].name, /서울아산병원/);
  const none = await hiraFind('가나다라메디컬센터');
  assert.equal(none.total, 0);
});

test('직업 — 약국도 확인하고, 못 찾으면 참고로 알린다', async () => {
  const ph = await jobPart('간호사·약사', '온누리약국');
  assert.ok(ph.facts.some((f) => /약국/.test(f.text) && /기준/.test(f.text)));
  const no = await jobPart('의사·치과의사·한의사', '가나다라메디컬센터');
  assert.equal(no.signals[0].level, 'note');
  assert.match(no.signals[0].title, /찾지 못했습니다/);
});

test("조회 서버가 응답하지 않은 칸만 남으면 '다시 확인 필요', 키가 없어 못 한 칸이 있으면 '연동 준비 중'", () => {
  const def = CHECKS.find((c) => c.id === 'biz');
  const retry = finalize(def, true, { pending: [busy('국세청', '국세청', '직접 확인해 보세요.')], facts: [{ tip: true, text: '안내' }] });
  assert.equal(retry.status, 'retry');
  assert.match(retry.pending[0].text, /응답하지 않아 확인하지 못했어요/);
  const pend = finalize(def, true, { pending: [{ label: '연동', text: '연동 뒤' }] });
  assert.equal(pend.status, 'pending');
  const clear = finalize(def, true, { pending: [busy('a', 'b', 'c')], facts: [{ text: '확인한 사실' }] });
  assert.equal(clear.status, 'clear');
});
