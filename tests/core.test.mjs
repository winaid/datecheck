// 네트워크 없이 도는 핵심 검사 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED } from '../lib/ai.mjs';
import { parsePhone, parseHost, extractUrls, lookalike, bizChecksumOk, siteUrlsIn } from '../lib/sources.mjs';
import { CHECKS, cleanInput, buildTimeline, reportOf } from '../lib/analyze.mjs';
import { priceFor, PRICE_VARIANTS } from '../lib/store.mjs';
import { isSnsUrl, companyName } from '../public/parse-input.js';

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
  const chat = '상대: 안녕\n나: 300만원 보낼게\n상대: 어제 2만원짜리 밥 먹었어\n상대: 해외 파견 중이라 영상통화는 어려워\n상대: 수수료 50만원을 먼저 보내야 해';
  const items = [{ id: 'money', signals: [{ title: '먼저 내라는 말', evidence: [{ match: '수수료 50만원을 먼저 보내야' }] }] }];
  const tl = buildTimeline(chat, items);
  assert.equal(tl.total, 5);
  assert.ok(tl.rows.every((r) => !r.text.includes('보낼게')), '나: 줄은 빼야 함');
  assert.ok(tl.rows.every((r) => !r.text.includes('밥')), 'AI 가 짚지 않은 금액 줄은 넣지 않음');
  assert.equal(tl.rows.find((r) => r.firstMoney).n, 5);
  assert.equal(tl.rows[0].amount, '50만원');
  const result = { items: [], totals: {}, meta: { notes: [] }, timeline: tl, subject: { phone: '010-0000-0000' } };
  assert.equal(reportOf(result, 'free').timeline.locked, true);
  assert.equal(reportOf(result, 'standard').plan, 'free');
  assert.equal(reportOf(result, 'full').timeline.rows.length, tl.rows.length);
  assert.equal(reportOf(result, 'full').casefile, null);
  assert.equal(reportOf(result, 'full', { casefile: true }).casefile.subject.phone, '010-0000-0000');
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
  assert.equal(bizChecksumOk('1248100998'), true);
  assert.equal(bizChecksumOk('1248100999'), false);
});

test('SNS·영상·블로그 주소는 확인하지 않는다 — 링크 칸·대화에서 걸러 낸다(2026-10-26)', () => {
  for (const u of ['instagram.com/kim_minji', 'https://www.instagram.com/p/C8x/', 'https://m.facebook.com/x', 'https://www.threads.com/@a', 'youtu.be/abc', 'https://www.youtube.com/watch?v=1', 'https://m.blog.naver.com/abc/1', 'https://open.kakao.com/o/abc', 'x.com/abc']) assert.ok(isSnsUrl(u), u);
  for (const u of ['https://upbit-event.xyz/join', 'coupang.com', 'naver.com', 'cafe.naver.com/abc', 'instagram-event.top']) assert.ok(!isSnsUrl(u), u);
  assert.deepEqual(siteUrlsIn('투자 https://abc.top/x 가입하고 인스타 https://instagram.com/kim 봐'), ['https://abc.top/x']);
});

test('회사 입력 — (주)·주식회사·뒤에 붙인 말을 뗀다', () => {
  for (const s of ['브이글로벌', '(주)브이글로벌', '주식회사 브이글로벌', '㈜브이글로벌', '브이글로벌 다녀요', '브이글로벌에서 일한대요']) assert.equal(companyName(s), '브이글로벌', s);
  assert.equal(companyName('Samsung Electronics Co., Ltd.'), 'Samsung Electronics');
});

test('전화번호 — + 없이 82부터 적어도 국내 번호로 읽는다', () => {
  assert.equal(parsePhone('821012345678').display, '010-1234-5678');
});

test('입력 정리 — 사진이 아닌 값과 너무 긴 값은 버린다', () => {
  const c = cleanInput({ photo: 'javascript:alert(1)', chatImages: ['data:image/png;base64,AAA', 'x'], chatText: 'a'.repeat(30000), claims: 'a'.repeat(5000), shop: '럭키몰', shopUrl: 'https://x.shop' });
  assert.equal(c.photo, '');
  assert.equal(c.chatImages.length, 1);
  assert.equal(c.chatText.length, 20000);
  // 2026-10-26 뺀 입력 — 받지 않는다
  assert.ok(!('claims' in c) && !('shop' in c) && !('shopUrl' in c));
});
