// 네트워크 없이 도는 핵심 규칙 검사 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleSignals, maskOwnLines } from '../lib/rules.mjs';
import { BANNED } from '../lib/ai.mjs';
import { parsePhone, parseHost, extractUrls, claimedYears, lookalike, bizChecksumOk, snsHandle } from '../lib/sources.mjs';
import { CHECKS, cleanInput, buildTimeline, reportOf } from '../lib/analyze.mjs';
import { priceFor, PRICE_VARIANTS } from '../lib/store.mjs';
import { parseSns, idInText, companyName, nameInTitle } from '../public/parse-input.js';

const items = (text) => ruleSignals(text).map((s) => `${s.item}:${s.key}`);

test('13개 항목, 번호 1~13, 무료 점검·정밀 분석 둘', () => {
  assert.equal(CHECKS.length, 13);
  assert.deepEqual(CHECKS.map((c) => c.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.ok(CHECKS.every((c) => ['free', 'full'].includes(c.plan)));
  // 대화·사진만 정밀 분석
  assert.deepEqual(CHECKS.filter((c) => c.plan === 'full').map((c) => c.id), ['money', 'invest', 'privacy', 'avoid', 'mismatch', 'photo']);
});

test('정밀 분석 가격 시험: 같은 방문자는 늘 같은 가격, 가격은 정해 둔 셋 중 하나', () => {
  assert.equal(priceFor('abcdef1234'), priceFor('abcdef1234'));
  const seen = new Set(['a1b2c3d4e5', 'ffff00001111', '0123456789ab', 'zzzz9999yyyy', 'q1w2e3r4t5y6', 'm9n8b7v6c5x4'].map(priceFor));
  for (const p of seen) assert.ok(PRICE_VARIANTS.includes(p));
  assert.equal(priceFor('<script>'), PRICE_VARIANTS[0]);
});

test('대화 순서 정리: 상대 말만, 처음 돈 이야기 표시, 무료 점검에서는 잠금', () => {
  const chat = '상대: 안녕\n나: 300만원 보낼게\n상대: 해외 파견 중이라 영상통화는 어려워\n상대: 수수료 50만원을 먼저 보내야 해';
  const items = [{ id: 'money', signals: [{ title: '먼저 내라는 말', evidence: [{ match: '수수료 50만원을 먼저 보내야' }] }] }];
  const tl = buildTimeline(chat, items);
  assert.equal(tl.total, 4);
  assert.ok(tl.rows.every((r) => !r.text.includes('보낼게')), '나: 줄은 빼야 함');
  assert.equal(tl.rows.find((r) => r.firstMoney).n, 4);
  const result = { items: [], totals: {}, meta: { notes: [] }, timeline: tl, subject: { phone: '010-0000-0000' } };
  assert.equal(reportOf(result, 'free').timeline.locked, true);
  assert.equal(reportOf(result, 'standard').plan, 'free');
  assert.equal(reportOf(result, 'full').timeline.rows.length, tl.rows.length);
  assert.equal(reportOf(result, 'full').casefile, null);
  assert.equal(reportOf(result, 'full', { casefile: true }).casefile.subject.phone, '010-0000-0000');
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

test('SNS 입력 — 어떻게 적어도 같은 아이디, 게시물 주소·한글 말은 아이디로 쓰지 않는다', () => {
  for (const s of ['instagram.com/kim_minji', '@kim_minji', 'https://www.instagram.com/kim_minji?igsh=MWx5', 'https://m.instagram.com/kim_minji/', 'instagr.am/kim_minji',
    'https://www.instagram.com/stories/kim_minji/3412/', '인스타 kim_minji', '인스타그램: @kim_minji', 'kim_minji (인스타)', 'https://www.threads.com/@kim_minji',
    'https://www.tiktok.com/@kim_minji', 'https://www.instagram.com/accounts/login/?next=/kim_minji/']) assert.equal(parseSns(s).id, 'kim_minji', s);
  assert.equal(parseSns('https://www.linkedin.com/in/minji-kim-123/').id, 'minji-kim-123');
  assert.equal(parseSns('카톡 아이디 minji77').id, 'minji77');
  assert.equal(parseSns('https://www.instagram.com/p/C8xYzAbc123/').why, 'post');
  assert.equal(parseSns('https://www.instagram.com/reel/C8xYzAbc123/').why, 'post');
  assert.equal(parseSns('민지짱').why, 'nickname');
  assert.equal(parseSns('https://upbit-event.xyz/join').why, 'site');
  // 아이디는 따로 떨어진 낱말일 때만, 흔한 낱말 같은 아이디는 SNS 말이 같이 있을 때만
  assert.ok(idInText('kim_minji', '인스타 kim_minji 사기 조심하세요'));
  assert.ok(!idInText('kim_minji', 'kim_minji2 계정 사기'));
  assert.ok(!idInText('minji', '민지 minji 사기 피해'));
  assert.ok(idInText('minji', '인스타 @minji 사기 피해'));
});

test('회사 입력 — (주)·주식회사·뒤에 붙인 말을 떼고, 다른 회사 이름 안에서는 잡지 않는다', () => {
  for (const s of ['브이글로벌', '(주)브이글로벌', '주식회사 브이글로벌', '㈜브이글로벌', '브이글로벌 다녀요', '브이글로벌에서 일한대요']) assert.equal(companyName(s), '브이글로벌', s);
  assert.equal(companyName('Samsung Electronics Co., Ltd.'), 'Samsung Electronics');
  assert.ok(nameInTitle('브이글로벌', '[단독] 브이 글로벌 사기 피해 2조'));
  assert.ok(nameInTitle('브이글로벌', '(주)브이글로벌사기 피해자 모임'));
  assert.ok(nameInTitle('카카오', '카카오 사칭 문자 주의'));
  assert.ok(!nameInTitle('카카오', '카카오톡으로 온 사기 문자'));
  assert.ok(!nameInTitle('카카오', '카카오페이증권 사칭 피해'));
});

test('전화번호 — + 없이 82부터 적어도 국내 번호로 읽는다', () => {
  assert.equal(parsePhone('821012345678').display, '010-1234-5678');
});

test('입력 정리 — 사진이 아닌 값과 너무 긴 값은 버린다', () => {
  const c = cleanInput({ photo: 'javascript:alert(1)', chatImages: ['data:image/png;base64,AAA', 'x'], claims: 'a'.repeat(5000) });
  assert.equal(c.photo, '');
  assert.equal(c.chatImages.length, 1);
  assert.equal(c.claims.length, 1000);
});
