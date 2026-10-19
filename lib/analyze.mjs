// DATE CHECK 13개 검증 항목 — 입력값에 따라 실행 가능한 검사를 산정하고(STEP 4) 돌린다.
import { phonePart, accountPart, linkPart, bizPart, commercePart, companyPart, jobPart, extractUrls } from './sources.mjs';
import { ruleSignals } from './rules.mjs';
import { aiReady, ocrChat, analyzeChatAI, inspectPhoto } from './ai.mjs';
import { LINKS } from './links.mjs';

const hasChat = (i) => Boolean(i.chat);

export const CHECKS = [
  { id: 'phone', no: 1, title: '전화번호 피해등록 확인', plan: 'standard', sources: ['더치트 API', '공개 웹 언급'], needs: (i) => Boolean(i.phone) },
  { id: 'account', no: 2, title: '계좌번호 피해등록 확인', plan: 'standard', sources: ['더치트 API', '공개 웹 언급'], needs: (i) => Boolean(i.account) },
  { id: 'money', no: 3, title: '금전요구 분석', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'invest', no: 4, title: '투자유도·로맨스스캠 패턴', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'privacy', no: 5, title: '개인정보 요구', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'avoid', no: 6, title: '만남·영상통화 회피', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'mismatch', no: 7, title: '진술 불일치', plan: 'full', sources: ['AI 대화 분석'], needs: (i) => hasChat(i) && Boolean(i.claims || i.company || i.job) },
  { id: 'photo', no: 8, title: '사진 검증', plan: 'full', sources: ['AI 사진 관찰', '동일·유사 이미지 탐색'], needs: (i) => Boolean(i.photo) },
  { id: 'link', no: 9, title: 'URL·도메인·SNS 검증', plan: 'standard', sources: ['KISA WHOIS·RDAP', '공개 웹 언급'], needs: (i) => Boolean(i.url || i.sns || extractUrls(i.chat).length) },
  { id: 'biz', no: 10, title: '사업자 진위·상태', plan: 'standard', sources: ['국세청 사업자등록정보'], needs: (i) => Boolean(i.biz) },
  { id: 'commerce', no: 11, title: '통신판매·방문판매 신고', plan: 'standard', sources: ['공정위', '행안부'], needs: (i) => Boolean(i.biz || i.shop) },
  { id: 'company', no: 12, title: '회사 공개정보', plan: 'standard', sources: ['금융위 기업기본정보', 'OpenDART', '공개 웹 언급'], needs: (i) => Boolean(i.company || i.shop) },
  { id: 'job', no: 13, title: '직업 공개정보', plan: 'standard', sources: ['심평원 병원정보'], needs: (i) => Boolean(i.job) },
];

const clip = (v, n) => String(v || '').trim().slice(0, n);
const isImage = (s) => /^data:image\/(png|jpeg|jpg|webp|heic|heif);base64,/.test(String(s || ''));

export function cleanInput(raw) {
  return {
    name: clip(raw.name, 30),
    phone: clip(raw.phone, 40),
    account: clip(raw.account, 40),
    bank: clip(raw.bank, 20),
    chatText: clip(raw.chatText, 20000),
    chatImages: (Array.isArray(raw.chatImages) ? raw.chatImages : []).filter(isImage).slice(0, 6),
    photo: isImage(raw.photo) ? raw.photo : '',
    sns: clip(raw.sns, 200),
    url: clip(raw.url, 2000),
    company: clip(raw.company, 60),
    job: clip(raw.job, 30),
    workplace: clip(raw.workplace, 60),
    biz: clip(raw.biz, 20),
    shop: clip(raw.shop, 60),
    claims: clip(raw.claims, 1000),
  };
}

function finalize(def, checkable, p) {
  const item = { id: def.id, no: def.no, title: def.title, plan: def.plan, sources: def.sources, checkable, signals: [], facts: [], pending: [], links: [] };
  if (!checkable) return { ...item, status: 'na' };
  Object.assign(item, { signals: p.signals || [], facts: p.facts || [], pending: p.pending || [], links: p.links || [] });
  const strong = item.signals.filter((s) => s.level === 'signal').length;
  item.signalCount = strong;
  item.noteCount = item.signals.length - strong;
  item.status = strong ? 'signal' : item.noteCount ? 'note' : item.facts.length ? 'clear' : item.pending.length ? 'pending' : 'clear';
  return item;
}

const overlap = (a, b) => a.some(([s1, e1]) => b.some(([s2, e2]) => s1 < e2 && e1 > s2));

async function chatParts(chat, input, notes) {
  const by = { money: [], invest: [], privacy: [], avoid: [], mismatch: [] };
  const rules = ruleSignals(chat);
  let ai = [];
  if (aiReady()) {
    try {
      ai = await analyzeChatAI(chat, input);
    } catch (e) {
      notes.push('AI 대화 분석이 응답하지 않아 규칙 분석 결과만 보여 드립니다.');
    }
  }
  for (const s of ai) by[s.item].push({ level: s.level, title: s.title, text: s.text, evidence: s.evidence, by: 'ai', spans: s.spans });
  // 규칙이 찾은 것 중 AI 가 같은 문장으로 이미 짚은 것은 뺀다
  const aiSpans = ai.flatMap((s) => s.spans || []);
  for (const r of rules) {
    const spans = r.evidence.map((e) => {
      const at = chat.indexOf(e.match);
      return at >= 0 ? [at, at + e.match.length] : [-1, -1];
    });
    if (overlap(spans, aiSpans)) continue;
    by[r.item].push({ level: r.level, title: r.title, text: r.text, evidence: r.evidence, by: 'rule' });
  }
  for (const k of Object.keys(by)) by[k] = by[k].map(({ spans, ...rest }) => rest);
  const parts = {};
  for (const k of Object.keys(by)) {
    parts[k] = { signals: by[k], facts: by[k].length ? [] : [{ text: k === 'mismatch' ? '대화와 상대가 말한 정보 사이에서 서로 맞지 않는 곳을 찾지 못했습니다.' : '이 갈래에 해당하는 말은 찾지 못했습니다.' }], pending: [], links: [] };
  }
  if (!aiReady()) for (const k of Object.keys(parts)) parts[k].pending.push({ label: 'AI 대화 분석', text: 'AI 키 연동 전이라 규칙 분석만 했습니다.' });
  return parts;
}

async function photoPart(photo, notes) {
  const out = { signals: [], facts: [], pending: [], links: [LINKS.lens, LINKS.tineye] };
  out.pending.push({ label: '동일·유사 이미지 웹 탐색', text: '이미지 검색 API 연동 뒤 "동일/유사 이미지 발견", "다른 사이트 사용 흔적"을 자동으로 알려 드립니다. 지금은 아래 버튼으로 직접 찾아볼 수 있습니다.' });
  if (!aiReady()) return out;
  try {
    const o = await inspectPhoto(photo);
    if (!o) return out;
    if (o.screenshot?.found) out.signals.push({ level: 'signal', title: '다른 사이트 사용 흔적', text: o.screenshot.detail || '다른 앱이나 SNS 화면을 캡처한 흔적이 보입니다.' });
    if (o.watermark?.found) out.signals.push({ level: 'signal', title: '다른 사이트 사용 흔적', text: o.watermark.detail || '사진에 다른 계정이나 사이트 표시가 보입니다.' });
    if (o.uniform?.found) out.signals.push({ level: 'note', title: '직업을 드러내는 옷차림 사진입니다', text: `${o.uniform.detail || ''} 군복·의사 가운 사진은 로맨스스캠에서 자주 쓰입니다. 이것만으로 판단할 수는 없습니다.`.trim() });
    if (o.professional?.found) out.signals.push({ level: 'note', title: '화보처럼 보정된 사진입니다', text: o.professional.detail || '광고·화보 사진처럼 보입니다. 같은 사진이 다른 곳에 있는지 찾아보세요.' });
    if (o.quality?.found) out.signals.push({ level: 'note', title: '여러 번 저장된 흔적이 있습니다', text: o.quality.detail || '화질이 낮거나 잘린 흔적이 있습니다.' });
    if (!out.signals.length) out.facts.push({ text: '사진에서 다른 사이트 화면이나 워터마크 같은 흔적은 보이지 않습니다.' });
  } catch {
    notes.push('사진 관찰 AI가 응답하지 않았습니다.');
  }
  return out;
}

export async function runAnalysis(raw) {
  const input = cleanInput(raw);
  const notes = [];
  // 캡처는 글로 옮겨 대화에 합친다
  let chat = input.chatText;
  let ocrLines = 0;
  if (input.chatImages.length) {
    if (aiReady()) {
      try {
        const lines = await ocrChat(input.chatImages);
        ocrLines = lines.length;
        chat = [chat, lines.join('\n')].filter(Boolean).join('\n');
      } catch {
        notes.push('대화 캡처를 읽지 못했습니다. 대화를 글로 붙여 넣으면 분석할 수 있습니다.');
      }
    } else {
      notes.push('대화 캡처 읽기는 AI 연동 뒤 가능합니다.');
    }
  }
  const view = { ...input, chat };
  const checkable = Object.fromEntries(CHECKS.map((c) => [c.id, c.needs(view)]));

  const [phone, account, chatP, photo, link, biz, commerce, company, job] = await Promise.all([
    checkable.phone ? phonePart(input.phone, input.name) : null,
    checkable.account ? accountPart(input.account, input.bank, input.name) : null,
    chat ? chatParts(chat, input, notes) : null,
    checkable.photo ? photoPart(input.photo, notes) : null,
    checkable.link ? linkPart({ url: input.url, sns: input.sns, chat, claims: input.claims }) : null,
    checkable.biz ? bizPart(input.biz) : null,
    checkable.commerce ? commercePart(input.biz, input.shop) : null,
    checkable.company ? companyPart(input.company || input.shop) : null,
    checkable.job ? jobPart(input.job, input.workplace) : null,
  ]);
  const parts = { phone, account, photo, link, biz, commerce, company, job, ...(chatP || {}) };
  const items = CHECKS.map((def) => finalize(def, checkable[def.id], parts[def.id] || {}));

  // 어떤 원본을 받았는지 개수만 남긴다 (자동파기 현황용)
  const originals = ['name', 'phone', 'account', 'chatText', 'photo', 'sns', 'url', 'company', 'biz', 'shop', 'claims'].filter((k) => input[k]).length + input.chatImages.length;

  return {
    items,
    totals: {
      total: CHECKS.length,
      checkable: items.filter((i) => i.checkable).length,
      signals: items.reduce((s, i) => s + (i.signalCount || 0), 0),
      notes: items.reduce((s, i) => s + (i.noteCount || 0), 0),
    },
    meta: { ocrLines, notes, ai: aiReady(), provided: Object.keys(input).filter((k) => (Array.isArray(input[k]) ? input[k].length : input[k])) },
    originals,
  };
}

// 사전분석(무료) — 상세 없이 항목 상태와 개수만
export function previewOf(result) {
  return {
    totals: result.totals,
    items: result.items.map(({ id, no, title, plan, checkable, status, signalCount, noteCount }) => ({ id, no, title, plan, checkable, status, signalCount: signalCount || 0, noteCount: noteCount || 0 })),
    notes: result.meta.notes,
  };
}

// 결제한 요금제에 맞춰 리포트를 연다. Standard 는 Full 전용 항목을 잠근다.
export function reportOf(result, plan) {
  return {
    plan,
    totals: result.totals,
    meta: { notes: result.meta.notes, ocrLines: result.meta.ocrLines, ai: result.meta.ai },
    items: result.items.map((it) => (plan === 'standard' && it.plan === 'full' && it.checkable
      ? { id: it.id, no: it.no, title: it.title, plan: it.plan, sources: it.sources, checkable: true, status: it.status, signalCount: it.signalCount || 0, noteCount: it.noteCount || 0, locked: true }
      : it)),
  };
}
