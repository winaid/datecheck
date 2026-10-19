// 네트워크 없이 도는 핵심 규칙 검사 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleSignals, maskOwnLines } from '../lib/rules.mjs';
import { BANNED } from '../lib/ai.mjs';
import { parsePhone, parseHost, extractUrls, claimedYears, lookalike, bizChecksumOk, snsHandle } from '../lib/sources.mjs';
import { CHECKS, cleanInput } from '../lib/analyze.mjs';

const items = (text) => ruleSignals(text).map((s) => `${s.item}:${s.key}`);

test('13개 항목, 번호 1~13, 요금제 둘', () => {
  assert.equal(CHECKS.length, 13);
  assert.deepEqual(CHECKS.map((c) => c.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.ok(CHECKS.every((c) => ['standard', 'full'].includes(c.plan)));
});

test('로맨스스캠 대화에서 항목별 신호를 찾는다', () => {
  const k = items([
    '상대: 나는 시리아에 파병 나와 있는 미군 군의관이야',
    '상대: 보안 때문에 영상통화는 못 해',
    '상대: 출금하려면 수수료를 먼저 입금해야 해',
    '상대: 신분증 사진 좀 보내줘',
  ].join('\n'));
  for (const want of ['invest:overseas_persona', 'avoid:avoid_meeting', 'money:fee_first', 'privacy:credentials']) assert.ok(k.includes(want), `${want} 없음: ${k}`);
});

test('"나:" 줄은 근거로 쓰지 않는다', () => {
  assert.deepEqual(items('나: 돈 좀 빌려줄 수 있어?\n상대: 왜?'), []);
  assert.ok(items('나: 왜?\n상대: 돈 좀 빌려줄 수 있어?').some((x) => x.startsWith('money:')));
  const masked = maskOwnLines('나: abc\n상대: def');
  assert.equal(masked.length, '나: abc\n상대: def'.length);
});

test('평범한 대화는 신호 없음', () => {
  assert.deepEqual(items('상대: 사진 보내줘 ㅋㅋ\n상대: 온라인으로 예약했어\n상대: 급해서 먼저 갈게'), []);
});

test('AI 금지어 — 사람 판정·결론 문구는 거른다', () => {
  for (const bad of ['사기일 가능성이 높아요', '이 사람은 사기꾼이에요', '위험도 92%', '사기 가능성 HIGH', '거짓말입니다', '이건 사기입니다', '가능성이 매우 높습니다']) assert.ok(BANNED.test(bad), bad);
  for (const ok of ['수수료를 먼저 내라고 해요', '전형적인 사기 수법에서 자주 보이는 말이에요', '영상통화를 피하는 말이 있어요']) assert.ok(!BANNED.test(ok), ok);
});

test('번호·주소·사업자', () => {
  assert.equal(parsePhone('010-1234-5678').kind, 'mobile');
  assert.equal(parsePhone('+855 12 345 678').country, '캄보디아');
  assert.equal(parsePhone('070-1234-5678').kind, 'internet');
  assert.equal(parseHost('https://www.upbit-event.xyz/join').registrable, 'upbit-event.xyz');
  assert.equal(lookalike('upblt.com')?.name, '업비트');
  assert.equal(lookalike('github.com'), null);
  assert.deepEqual(extractUrls('여기 https://abc.top/x 가입'), ['https://abc.top/x']);
  assert.equal(claimedYears('8년째 운영 중'), 8);
  assert.equal(bizChecksumOk('1248100998'), true);
  assert.equal(bizChecksumOk('1248100999'), false);
  assert.equal(snsHandle('https://instagram.com/abc_123/'), 'abc_123');
  assert.equal(snsHandle('@abc_123'), 'abc_123');
});

test('입력 정리 — 사진이 아닌 값과 너무 긴 값은 버린다', () => {
  const c = cleanInput({ photo: 'javascript:alert(1)', chatImages: ['data:image/png;base64,AAA', 'x'], claims: 'a'.repeat(5000) });
  assert.equal(c.photo, '');
  assert.equal(c.chatImages.length, 1);
  assert.equal(c.claims.length, 1000);
});
