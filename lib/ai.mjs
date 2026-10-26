// AI 분석 (제미나이) — 기획서 5.2 카톡·DM 분석, 5.3 사진 검증의 관찰.
// AI 가 낸 근거 문장은 원문에 실제로 있는지 다시 확인하고, 없으면 버린다.
import { recordApi } from './store.mjs';
import { snippet } from './rules.mjs';

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
export async function ocrChat(images) {
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
  const out = await gemini(parts);
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

export async function analyzeChatAI(chat, ctx) {
  const context = [
    ctx.claims ? `상대방이 직접 말한 정보: ${ctx.claims}` : '',
    ctx.company ? `상대방이 말한 회사: ${ctx.company}` : '',
    ctx.job ? `상대방이 말한 직업: ${ctx.job}${ctx.workplace ? ` (근무처 ${ctx.workplace})` : ''}` : '',
  ].filter(Boolean).join('\n');

  const prompt = [
    '너는 데이트·소개팅 전 사기 예방을 돕는 검증 도우미다. 사람을 판정하지 않고, 대화에 있는 확인이 필요한 신호만 찾는다.',
    '',
    '[찾을 신호 갈래]',
    'money: 돈을 보내 달라, 빌려 달라, 수수료·세금·보증금을 먼저 내라, 상품권·코인으로 달라, 다른 사람 계좌로 보내라는 요구',
    'invest: 코인·주식·투자 사이트 권유, 수익 보장, 해외 파병·해외 근무 같은 로맨스스캠 설정, 다른 메신저로 옮기자, 비밀로 하라, 아주 이른 결혼 약속',
    'privacy: 신분증·인증번호·비밀번호·계좌 비밀번호·주민번호 요구, 앱 설치나 원격 조종 요구',
    'avoid: 영상통화·만남을 계속 피하거나 미루는 말',
    'mismatch: 대화 속 말끼리, 또는 대화와 아래 제공 정보가 서로 맞지 않는 곳. 사는 곳, 직업, 근무지, 나이, 가족, 운영 기간처럼 사실로 맞춰 볼 수 있는 것만 본다. 예: 제공 정보에서는 서울에 산다고 했는데 대화에서는 해외에 파병 중이라고 함',
    '',
    '[규칙]',
    '1. 대화에 "나:"와 "상대:"가 있으면 "상대:"의 말만 근거로 쓴다.',
    '2. evidence 는 대화 원문(또는 제공 정보)에서 글자 그대로 복사한 짧은 구절(40자 이하)이다. 바꾸거나 요약하면 안 된다. "상대:" 같은 머리말은 빼고 복사한다.',
    '3. 근거가 분명하지 않으면 신호를 만들지 않는다. 평범한 대화면 빈 배열을 낸다.',
    '4. 사람을 판정하거나 결론을 내리는 말을 쓰지 않는다. "사기꾼", "범죄자", "거짓말", "위험도", "사기일 가능성이 높다", "사기입니다", 퍼센트, 확률 표현 금지. 상대의 속마음이나 의도도 단정하지 않는다. 그 말이 왜 확인이 필요한지만 쓴다.',
    '5. title 은 25자 안팎, "~이 있어요" "~하는 말이 있어요"처럼 사실을 짚는 존댓말. explanation 은 왜 확인이 필요한지 한두 문장, "~요" 체. 괄호, 줄표, 느낌표, 영어를 쓰지 않는다.',
    '6. strength: 그것만으로도 확인이 꼭 필요한 신호는 "signal", 참고만 할 것은 "note".',
    '',
    context ? `[제공 정보]\n${context}\n` : '',
    '[대화]',
    chat,
    '',
    'JSON 으로만 답하라: {"signals":[{"category":"money","title":"...","explanation":"...","evidence":["..."],"strength":"signal"}]}',
  ].join('\n');

  const out = await gemini([{ text: prompt }]);
  const list = Array.isArray(out?.signals) ? out.signals : [];
  const sources = [String(chat || ''), context];
  const signals = [];
  for (const s of list) {
    if (!CATEGORY.has(s?.category)) continue;
    const title = norm(s.title);
    const text = norm(s.explanation);
    if (!title || BANNED.test(title) || BANNED.test(text)) continue;
    const evidence = [];
    const spans = [];
    for (const q of (Array.isArray(s.evidence) ? s.evidence : []).slice(0, 3)) {
      for (const src of sources) {
        const hay = src;
        const hit = locate(hay, q);
        if (hit === -1) continue;
        const base = hit.flat ? hay.replace(/\s+/g, ' ') : hay;
        evidence.push(snippet(base, hit.at, hit.len));
        if (src === sources[0] && !hit.flat) spans.push([hit.at, hit.at + hit.len]);
        break;
      }
    }
    if (!evidence.length) continue; // 원문에 없는 근거는 버린다
    signals.push({ item: s.category, level: s.strength === 'note' ? 'note' : 'signal', title, text, evidence, spans, by: 'ai' });
  }
  return signals;
}

// ---------- 사진 관찰 ----------
export async function inspectPhoto(dataUrl) {
  const part = dataUrlPart(dataUrl);
  if (!part) return null;
  const prompt = [
    '이 사진은 사용자가 만나기 전 상대방에게 받은 프로필 사진이다.',
    '사진 속 사람이 누구인지 추측하거나 이름·국적·나이를 말하지 마라. 얼굴 생김새도 평가하지 마라.',
    '아래 항목만 사진에 보이는 사실로 확인하라.',
    'screenshot: 다른 앱이나 SNS 화면을 캡처한 흔적(상태표시줄, 좋아요·댓글 버튼, 앱 메뉴 등)이 보이는가',
    'watermark: 워터마크, 다른 계정 아이디(@로 시작), 웹사이트 주소, 로고 글자가 보이는가. 웹사이트 주소·업체 로고는 그 글자를 그대로 적되, 사람의 계정 아이디나 이름은 옮겨 적지 말고 "다른 계정 아이디가 보임"처럼 무엇이 보이는지만 적는다',
    'professional: 광고·화보처럼 스튜디오 조명과 강한 보정이 보이는 사진인가',
    'uniform: 군복, 의사 가운, 제복 같은 직업을 드러내는 옷차림인가. 보이면 무엇인지',
    'quality: 여러 번 저장해 화질이 낮거나 일부가 잘려 나간 흔적이 있는가',
    'detail 은 한 문장, "~요" 체, 괄호와 느낌표 없이 쓴다.',
    'JSON 으로만 답하라: {"screenshot":{"found":false,"detail":""},"watermark":{"found":false,"detail":""},"professional":{"found":false,"detail":""},"uniform":{"found":false,"detail":""},"quality":{"found":false,"detail":""}}',
  ].join('\n');
  return gemini([part, { text: prompt }]);
}
