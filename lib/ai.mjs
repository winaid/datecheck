// AI 분석 (제미나이) — 기획서 5.2 카톡·DM 분석, 5.3 사진 검증의 관찰.
// AI 가 낸 근거 문장은 원문에 실제로 있는지 다시 확인하고, 없으면 버린다.
// 대화 판별은 AI 만 한다 — 낱말 규칙은 앞뒤 맥락을 못 봐서 잘못 짚는 경우가 많다(2026-10-26 오너, 규칙 엔진 삭제).
import { recordApi } from './store.mjs';

// 근거 구절 앞뒤를 같은 줄 안에서 조금 붙여 보여 준다
export function snippet(text, index, length) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  let lineEnd = text.indexOf('\n', index + length);
  if (lineEnd === -1) lineEnd = text.length;
  const from = Math.max(lineStart, index - 28);
  const to = Math.min(lineEnd, index + length + 28);
  return {
    before: (from > lineStart ? '…' : '') + text.slice(from, index),
    match: text.slice(index, index + length),
    after: text.slice(index + length, to) + (to < lineEnd ? '…' : ''),
  };
}

// 추정 단가(USD, 100만 토큰당). 실제 청구 단가는 확인 필요 — 관리자 화면 원가 추정에만 쓴다.
export const GEMINI_PRICE = { input: 0.3, output: 2.5, krwPerUsd: 1400 };

export function aiReady() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function stripFence(t) {
  return String(t || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

async function gemini(parts, { timeout = 60000 } = {}) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  };
  const t0 = Date.now();
  let ok = false;
  let usage = null;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    const j = await r.json();
    if (!r.ok) throw new Error(`gemini ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    usage = j.usageMetadata;
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const parsed = JSON.parse(stripFence(text));
    ok = true;
    return parsed;
  } finally {
    const inTok = usage?.promptTokenCount || 0;
    const outTok = (usage?.candidatesTokenCount || 0) + (usage?.thoughtsTokenCount || 0);
    const krw = ((inTok * GEMINI_PRICE.input + outTok * GEMINI_PRICE.output) / 1e6) * GEMINI_PRICE.krwPerUsd;
    recordApi('gemini', { ok, ms: Date.now() - t0, krw, tokens: inTok + outTok });
  }
}

function dataUrlPart(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg|webp|heic|heif));base64,(.+)$/);
  if (!m) return null;
  return { inlineData: { mimeType: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] } };
}

// ---------- 캡처 → 대화 글 ----------
export async function ocrChat(images, { timeout = 25000 } = {}) {
  const parts = images.map(dataUrlPart).filter(Boolean);
  if (!parts.length) return [];
  parts.push({
    text: [
      '위 이미지들은 메신저(카카오톡, 인스타그램 DM, 데이팅 앱 등) 대화 캡처다.',
      '대화를 화면에 보이는 순서대로, 말풍선 하나를 한 줄로 옮겨라.',
      '오른쪽 말풍선(보통 노란색·파란색, 내가 보낸 말)은 "나: "로, 왼쪽 말풍선(상대가 보낸 말)은 "상대: "로 시작하라.',
      '글자는 고치거나 요약하지 말고 보이는 그대로 옮겨라. 맞춤법이 틀려도 그대로 둔다.',
      '시간, 읽음 숫자, 날짜 구분선, 앱 메뉴와 입력창 글자는 빼라. 사진만 있는 말풍선은 "[사진]", 이모티콘은 "[이모티콘]"으로 적어라.',
      '이미지가 대화 캡처가 아니면 빈 배열을 내라.',
      'JSON 으로만 답하라: {"lines": ["상대: ...", "나: ..."]}',
    ].join('\n'),
  });
  const out = await gemini(parts, { timeout });
  return Array.isArray(out?.lines) ? out.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 400) : [];
}

// ---------- 대화 분석 ----------
const CATEGORY = new Set(['money', 'invest', 'privacy', 'avoid', 'mismatch']);
// 기획서 7장 '금지' 문구 — 사람을 판정하거나 사기라고 결론 내리는 말
export const BANNED = /(사기꾼|범죄자|거짓말|위험도|확률|가능성\s*(이|은|도)?\s*(매우\s*)?(높|크|HIGH)|사기일\s*(가능성|수|것)|사기\s*(입니다|예요|이에요|임)|확실(히|한)\s*사기|명백(히|한)|틀림없|\d+\s*%\s*(확률|가능))/i;

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function locate(haystack, quote) {
  const q = norm(quote).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  if (q.length < 2) return -1;
  const at = haystack.indexOf(q);
  if (at >= 0) return { at, len: q.length };
  // 공백 차이만 있는 경우
  const flat = haystack.replace(/\s+/g, ' ');
  const i2 = flat.indexOf(q);
  return i2 >= 0 ? { at: i2, len: q.length, flat: true } : -1;
}

// 9번 링크 점검에 쓰는 값 — 말한 운영 기간(년)과 코인 거래소·투자 사이트 권유 여부. 낱말 규칙 대신 AI 가 앞뒤를 읽고 정한다
export const NO_HINTS = Object.freeze({ years: null, crypto: false });
function parseHints(h) {
  const y = Number(h?.claimedYears);
  return { years: Number.isInteger(y) && y >= 1 && y <= 60 ? y : null, crypto: h?.cryptoInvite === true };
}
const HINT_RULES = [
  'claimedYears: 상대가 자기 사업·쇼핑몰·사이트·회사를 몇 년째 운영했다고 말한 기간(정수, 년). 나이, 연애 기간, 직장 경력, 사는 기간은 운영 기간이 아니다. 말이 없으면 null.',
  'cryptoInvite: 상대가 이용자에게 코인·가상자산 거래소나 투자 사이트에 가입하거나 거기서 사고팔라고 권했으면 true. 코인을 뉴스나 자기 이야기로 말한 것뿐이면 false.',
];

export async function analyzeChatAI(chat, ctx, { timeout = 25000 } = {}) {
  const context = [
    ctx.company ? `상대방이 말한 회사: ${ctx.company}` : '',
    ctx.job ? `상대방이 말한 직업: ${ctx.job}${ctx.workplace ? ` (근무처 ${ctx.workplace})` : ''}` : '',
  ].filter(Boolean).join('\n');

  const prompt = [
    '너는 데이트·소개팅·거래 상대와 나눈 대화를 읽고, 돈을 보내거나 개인정보를 넘기기 전에 확인이 필요한 말을 찾아 주는 검증 도우미다. 사람을 판정하지 않는다.',
    '',
    '[판단하는 법]',
    '낱말이 나왔다는 것만으로 신호를 만들지 않는다. 앞뒤 대화를 읽고, 상대가 이용자에게 실제로 무엇을 요구하거나 권하는지로 판단한다.',
    '상대가 자기 직업이 투자 회사라고 말한 것, 이용자가 먼저 투자 이야기를 꺼낸 것, 뉴스 이야기로 코인을 말한 것은 투자 권유가 아니다. 이용자에게 특정 사이트·거래소·종목에 돈을 넣으라고 권해야 신호다.',
    '밥값·선물·더치페이·월급처럼 일상으로 금액을 말한 것, 상대가 돈을 쓰거나 보내 주겠다고 한 것은 금전 요구가 아니다.',
    '카메라가 한 번 안 된다며 다른 날을 정한 것은 참고 정도다. 이유를 바꿔 가며 계속 미루거나, 보안·규정 때문에 영상통화를 아예 못 한다고 하면 신호다.',
    '농담, 부정하는 말(예: 돈 보내지 마), 사기를 조심하자는 말, 지난 일을 이야기한 것은 신호가 아니다.',
    '대화에 "나:"와 "상대:"가 있으면 "상대:"가 한 말만 근거로 쓴다. 이용자가 한 말은 근거가 될 수 없다.',
    '평범한 대화면 빈 배열을 낸다. 애매하면 만들지 않는다.',
    '',
    '[찾을 갈래]',
    'money: 돈을 보내 달라·빌려 달라는 요구, 수수료·세금·통관비·보증금을 먼저 내야 돈이나 물건을 받는다는 말, 상품권 핀번호·코인으로 달라는 요구, 본인이 아닌 다른 사람 이름의 계좌로 보내라는 말, 대출을 해 주겠다며 먼저 돈을 내라는 말, 지금 당장 보내라는 재촉',
    'invest: 코인·주식·리딩방·해외 선물·투자 사이트 가입이나 입금 권유, 원금이나 수익 보장(하루 몇 퍼센트 등), 내부 정보, 좋아요 누르기·리뷰·구매 대행 같은 쉬운 일에 큰돈을 준다는 부업 제안, 텔레그램·왓츠앱 같은 다른 메신저로 옮기자는 말, 주변에 말하지 말라·비밀로 하자는 말, 알게 된 지 얼마 안 됐는데 결혼·평생을 약속하는 말, 해외 파병 군인·군의관·해외 현장 근무·선장·외교관처럼 만날 수 없는 설정',
    'privacy: 신분증 사진·인증번호·비밀번호·공동인증서·카드 번호·주민등록번호 요구, 앱 설치·원격 조종 앱·apk 파일 설치 요구, 링크를 눌러 로그인·인증하라는 요구',
    'avoid: 영상통화·만남을 피하거나 계속 미루는 말',
    'mismatch: 대화 속 말끼리, 또는 대화와 아래 제공 정보가 사실로서 서로 맞지 않는 곳. 사는 곳, 직업, 근무지, 나이, 가족, 운영 기간처럼 맞춰 볼 수 있는 것만 본다. 출장·여행처럼 둘 다 성립할 수 있으면 불일치가 아니다. 예: 제공 정보에서는 서울에 산다고 했는데 대화에서는 해외에 파병 중이라고 함',
    '',
    '[세기]',
    'signal: 그것만으로도 돈을 보내기 전에 꼭 확인해야 하는 말. 금전 요구, 먼저 내라는 요구, 상품권·코인 요구, 다른 이름 계좌, 투자 사이트 권유, 수익 보장, 신분증·인증번호 요구, 앱 설치 요구, 영상통화를 아예 못 한다는 말, 사실이 맞지 않는 곳',
    'note: 이것만으로는 판단하기 어려운 말. 이른 결혼 약속, 해외 근무 설정, 비밀 요구, 재촉, 한 번 미룬 만남',
    '',
    '[쓰는 법]',
    '1. evidence 는 대화 원문(또는 제공 정보)에서 글자 그대로 복사한 짧은 구절(40자 이하)이다. 바꾸거나 요약하면 안 된다. "상대:" 같은 머리말은 빼고 복사한다.',
    '2. 한 구절은 가장 알맞은 갈래 하나에만 쓴다. 같은 갈래에서 같은 종류의 말(예: 여러 번 재촉함)이 여러 번 나오면 신호 하나로 묶고 evidence 에 구절을 여러 개(최대 3개) 넣는다.',
    '3. 사람을 판정하거나 결론을 내리는 말을 쓰지 않는다. "사기꾼", "범죄자", "거짓말", "위험도", "사기일 가능성이 높다", "사기입니다", 퍼센트, 확률 표현 금지. 상대의 속마음이나 의도도 단정하지 않는다. 그 말이 왜 확인이 필요한지만 쓴다.',
    '4. title 은 25자 안팎, 사실을 짚는 존댓말. 예: "수수료를 먼저 내라는 말이 있어요", "영상통화를 할 수 없다고 해요", "사는 곳이 제공 정보와 달라요". "~하는 점이 있어요"는 쓰지 않는다. explanation 은 왜 확인이 필요한지 한두 문장, "~요" 체. 괄호, 줄표, 느낌표, 영어를 쓰지 않는다.',
    '',
    '[함께 낼 값 hints]',
    ...HINT_RULES,
    '',
    context ? `[제공 정보]\n${context}\n` : '',
    '[대화]',
    chat,
    '',
    'JSON 으로만 답하라: {"signals":[{"category":"money","title":"...","explanation":"...","evidence":["..."],"strength":"signal"}],"hints":{"claimedYears":null,"cryptoInvite":false}}',
  ].join('\n');

  const out = await gemini([{ text: prompt }], { timeout });
  const list = Array.isArray(out?.signals) ? out.signals : [];
  const src = String(chat || '');
  // "나:"·"상대:"로 나뉜 대화면 이용자가 한 말에서 찾은 근거는 버린다(AI 가 규칙을 어겨도)
  const marked = /^\s*(나|상대)\s*[:：]/m.test(src);
  const ownLine = (at) => marked && /^\s*나\s*[:：]/.test(src.slice(src.lastIndexOf('\n', at) + 1));
  const sources = [src, context];
  const signals = [];
  const used = new Set();
  for (const s of list) {
    if (!CATEGORY.has(s?.category)) continue;
    const title = norm(s.title);
    const text = norm(s.explanation);
    if (!title || BANNED.test(title) || BANNED.test(text)) continue;
    const evidence = [];
    for (const q of (Array.isArray(s.evidence) ? s.evidence : []).slice(0, 3)) {
      for (const hay of sources) {
        const hit = locate(hay, q);
        if (hit === -1) continue;
        if (hay === src && !hit.flat && ownLine(hit.at)) break;
        const base = hit.flat ? hay.replace(/\s+/g, ' ') : hay;
        const key = `${hay === src ? 'c' : 'x'}:${hit.at}`;
        if (used.has(key)) break; // 같은 구절을 두 신호에 쓰지 않는다
        used.add(key);
        evidence.push(snippet(base, hit.at, hit.len));
        break;
      }
    }
    if (!evidence.length) continue; // 원문에 없는 근거는 버린다
    signals.push({ item: s.category, level: s.strength === 'note' ? 'note' : 'signal', title, text, evidence, by: 'ai' });
  }
  return { signals, hints: parseHints(out?.hints) };
}

// ---------- 사진 관찰 ----------
export async function inspectPhoto(dataUrl, { timeout = 40000 } = {}) {
  const part = dataUrlPart(dataUrl);
  if (!part) return null;
  const prompt = [
    '이 사진은 사용자가 만나기 전 상대방에게 받은 프로필 사진이다.',
    '사진 속 사람이 누구인지 추측하거나 이름·국적·나이를 말하지 마라. 얼굴 생김새도 평가하지 마라.',
    '아래 항목만 사진에 보이는 사실로 확인하라.',
    'screenshot: 다른 앱이나 SNS 화면을 캡처한 흔적(상태표시줄, 좋아요·댓글 버튼, 앱 메뉴 등)이 보이는가',
    'watermark: 사진 위에 나중에 덧붙인 워터마크, 다른 계정 아이디(@로 시작), 웹사이트 주소, 로고 글자가 보이는가. 배경의 간판·현수막·행사장 벽·옷이나 물건에 원래 쓰여 있는 글자는 해당하지 않는다. 웹사이트 주소·업체 로고는 그 글자를 그대로 적되, 사람의 계정 아이디나 이름은 옮겨 적지 말고 "다른 계정 아이디가 보임"처럼 무엇이 보이는지만 적는다',
    'professional: 광고·화보처럼 스튜디오 조명과 강한 보정이 보이는 사진인가',
    'event: 레드카펫, 시상식·행사장 벽, 무대, 기자회견처럼 공개 행사에서 찍힌 사진인가. 보이면 어떤 자리로 보이는지',
    'uniform: 군복, 의사 가운, 제복 같은 직업을 드러내는 옷차림인가. 보이면 무엇인지',
    'quality: 여러 번 저장해 화질이 낮거나 일부가 잘려 나간 흔적이 있는가',
    'detail 은 한 문장, "~요" 체, 괄호와 느낌표 없이 쓴다.',
    'JSON 으로만 답하라: {"screenshot":{"found":false,"detail":""},"watermark":{"found":false,"detail":""},"professional":{"found":false,"detail":""},"event":{"found":false,"detail":""},"uniform":{"found":false,"detail":""},"quality":{"found":false,"detail":""}}',
  ].join('\n');
  return gemini([part, { text: prompt }], { timeout });
}
