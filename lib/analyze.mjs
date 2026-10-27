// DATE CHECK 13개 검증 항목 — 입력값에 따라 실행 가능한 검사를 산정하고(STEP 4) 돌린다.
import { phonePart, accountPart, linkPart, bizPart, commercePart, companyPart, jobPart, siteUrlsIn, busy } from './sources.mjs';
import { isSnsUrl } from '../public/parse-input.js';
// AI 가 읽은 워터마크 글자에 남의 계정 아이디가 섞여 와도 옮겨 적지 않는다
// AI 가 쓴 한 문장 뒤에 안내를 이어 붙일 때 마침표가 빠져 있으면 붙인다
const dot = (t) => { const x = String(t || '').trim(); return x && !/[.!?]$/.test(x) ? `${x}.` : x; };
const noHandle = (t) => String(t || '').replace(/@[A-Za-z0-9._]{2,}/g, '@아이디');
import { aiReady, ocrChat, analyzeChatAI, inspectPhoto, NO_HINTS } from './ai.mjs';
import { visionReady, webDetect } from './vision.mjs';
import { LINKS } from './links.mjs';

const hasChat = (i) => Boolean(i.chat);

// plan: free = 무료 점검에서 바로 보이는 항목, full = 정밀 분석(결제) 항목 — 2026-10-22 오너 결정
export const CHECKS = [
  { id: 'phone', no: 1, title: '전화번호 피해등록 확인', plan: 'free', sources: ['번호 종류', '경찰민원24·더치트 직접 조회', '네이버 직접 검색'], needs: (i) => Boolean(i.phone) },
  { id: 'account', no: 2, title: '계좌번호 피해등록 확인', plan: 'free', sources: ['경찰민원24·더치트 직접 조회', '네이버 직접 검색'], needs: (i) => Boolean(i.account) },
  { id: 'money', no: 3, title: '금전요구 분석', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'invest', no: 4, title: '투자유도·로맨스스캠 패턴', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'privacy', no: 5, title: '개인정보 요구', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'avoid', no: 6, title: '만남·영상통화 회피', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  // 대화 속 말끼리 맞지 않는 곳도 본다(AI 지시문과 같게) — 회사·직업을 안 넣으면 AI 가 찾은 불일치가 통째로 버려지던 것(2026-10-27)
  { id: 'mismatch', no: 7, title: '진술 불일치', plan: 'full', sources: ['AI 대화 분석'], needs: hasChat },
  { id: 'photo', no: 8, title: '사진 도용 확인', plan: 'full', sources: ['같은 사진 웹 검색', 'AI 사진 관찰'], needs: (i) => Boolean(i.photo) },
  { id: 'link', no: 9, title: 'URL·도메인 검증', plan: 'free', sources: ['KISA WHOIS·RDAP', '닮은 주소'], needs: (i) => Boolean(i.url || siteUrlsIn(i.chat).length) },
  { id: 'biz', no: 10, title: '사업자 진위·상태', plan: 'free', sources: ['국세청 사업자등록정보'], needs: (i) => Boolean(i.biz) },
  { id: 'commerce', no: 11, title: '통신판매·방문판매 신고', plan: 'free', sources: ['공정위 통신판매', '방문판매·다단계'], needs: (i) => Boolean(i.biz) },
  { id: 'company', no: 12, title: '회사 공개정보', plan: 'free', sources: ['금융위 기업기본정보', '네이버 직접 검색'], needs: (i) => Boolean(i.company) },
  { id: 'job', no: 13, title: '직업 공개정보', plan: 'free', sources: ['심평원 병원정보'], needs: (i) => Boolean(i.job) },
];
export const CHAT_IDS = ['money', 'invest', 'privacy', 'avoid', 'mismatch'];

const clip = (v, n) => String(v || '').trim().slice(0, n);
const isImage = (s) => /^data:image\/(png|jpeg|jpg|webp|heic|heif);base64,/.test(String(s || ''));

export function cleanInput(raw) {
  // 이름은 받지 않는다(2026-10-26, 최소 수집) — 예전 화면이 보내도 여기서 버린다
  // '쇼핑몰·사업체명'·'상대가 직접 말한 정보'도 2026-10-26 오너 지시로 뺐다 — 예전 화면이 shop·shopUrl·claims 를 보내도 받지 않는다
  return {
    phone: clip(raw.phone, 40),
    account: clip(raw.account, 40),
    bank: clip(raw.bank, 20),
    chatText: clip(raw.chatText, 20000),
    chatImages: (Array.isArray(raw.chatImages) ? raw.chatImages : []).filter(isImage).slice(0, 6),
    photo: isImage(raw.photo) ? raw.photo : '',
    // SNS 계정은 받지 않는다(2026-10-26) — 예전 화면이 SNS 칸을 보내도 버리고, 링크 칸에 섞인 SNS·영상·블로그 주소도 뺀다
    url: clip(raw.url, 2000).split(/[\s,]+/).filter((u) => u && !isSnsUrl(u)).join('\n'),
    company: clip(raw.company, 60),
    job: clip(raw.job, 30),
    workplace: clip(raw.workplace, 60),
    biz: clip(raw.biz, 20),
  };
}

export function finalize(def, checkable, p) {
  const item = { id: def.id, no: def.no, title: def.title, plan: def.plan, sources: def.sources, checkable, signals: [], facts: [], pending: [], links: [] };
  if (!checkable) return { ...item, status: 'na' };
  Object.assign(item, { signals: p.signals || [], facts: p.facts || [], pending: p.pending || [], links: p.links || [] });
  const strong = item.signals.filter((s) => s.level === 'signal').length;
  item.signalCount = strong;
  item.noteCount = item.signals.length - strong;
  // tip(직접 살펴볼 것 안내)은 확인한 사실이 아니라 상태를 정할 때 세지 않는다
  const found = item.facts.filter((f) => !f.tip).length;
  // 조회 서버가 잠깐 응답하지 않아 못 본 칸만 남았으면 'retry'(다시 확인 필요) — 키가 없어 아직 못 하는 'pending'(연동 준비 중)과 구분
  const waiting = item.pending.every((x) => x.retry) ? 'retry' : 'pending';
  // 자동으로 확인한 사실이 하나도 없으면 '특이사항 없음'이 아니라 'manual'(직접 확인 필요) —
  // 계좌처럼 조회할 공식 자료가 없는 칸에 초록 '특이사항 없음'이 떠 문제없는 계좌로 읽히던 것(2026-10-27)
  item.status = strong ? 'signal' : item.noteCount ? 'note' : found ? 'clear' : item.pending.length ? waiting : 'manual';
  return item;
}

// 대화 판별은 AI 만 — 낱말 규칙은 맥락을 못 봐 잘못 짚는 경우가 많아 쓰지 않는다(2026-10-26 오너).
// AI 가 응답하지 않으면 규칙으로 대신하지 않고 '다시 확인 필요'로 알린다. 한 번은 다시 묻는다(함수 60초 안에서).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function chatAi(chat, input, deadline) {
  for (let k = 0; ; k += 1) {
    const left = deadline - Date.now();
    try {
      return await analyzeChatAI(chat, input, { timeout: Math.max(5000, Math.min(25000, left - 2000)) });
    } catch (e) {
      if (k >= 1 || deadline - Date.now() < 10000) throw e;
      await wait(700);
    }
  }
}

async function chatParts(chat, input, notes, deadline) {
  const parts = Object.fromEntries(CHAT_IDS.map((k) => [k, { signals: [], facts: [], pending: [], links: [] }]));
  if (!aiReady()) {
    for (const k of CHAT_IDS) parts[k].pending.push({ label: 'AI 대화 분석', text: 'AI 대화 분석을 연결하기 전이라 대화를 판별하지 않았습니다. 낱말만 보고 판단하면 틀리기 쉬워 AI가 읽을 수 있을 때만 결과를 드립니다.' });
    return { parts, hints: NO_HINTS };
  }
  let ai;
  try {
    ai = await chatAi(chat, input, deadline);
  } catch {
    notes.push('AI 대화 분석이 잠시 응답하지 않아 대화 항목(금전요구·투자유도·개인정보 요구·회피·진술 불일치)은 판별하지 못했습니다. 잠시 뒤 다시 점검하면 확인할 수 있고, 무료 점검은 다시 해도 비용이 들지 않습니다.');
    for (const k of CHAT_IDS) parts[k].pending.push(busy('AI 대화 분석', 'AI 대화 분석(구글 제미나이)', '무료 점검은 다시 해도 비용이 들지 않아요. 낱말만 보고 판단하면 틀리기 쉬워 AI가 읽을 수 있을 때만 결과를 드려요.'));
    return { parts, hints: NO_HINTS };
  }
  for (const s of ai.signals) parts[s.item].signals.push({ level: s.level, title: s.title, text: s.text, evidence: s.evidence, by: 'ai' });
  const told = input.company || input.job;
  for (const k of CHAT_IDS) {
    if (parts[k].signals.length) continue;
    parts[k].facts.push({ text: k !== 'mismatch' ? '이 갈래에 해당하는 말은 찾지 못했습니다.'
      : told ? '대화 속 말끼리, 또 대화와 넣은 회사·직업 사이에서 서로 맞지 않는 곳을 찾지 못했습니다.'
        : '대화 속 말끼리 서로 맞지 않는 곳을 찾지 못했습니다.' });
  }
  return { parts, hints: ai.hints };
}

// 같은 사진이 올라간 페이지 → 신호. SNS 계정 페이지는 주소·제목(이름·아이디가 들어 있다)을 보여 주지 않고 개수만 —
// 상대 본인 계정이면 사람 찾기가 된다(2026-10-26, 이름·SNS 를 받지 않는 것과 같은 기준)
export function photoMatches(w) {
  const signals = [];
  const facts = [];
  const open = (list) => list.filter((p) => !isSnsUrl(p.url));
  const src = (list) => open(list).slice(0, 5).map((p) => ({ title: p.title, url: p.url, where: p.host }));
  const hidden = (list) => {
    const n = list.length - open(list).length;
    if (!n) return '';
    return n === list.length
      ? ' 모두 SNS 계정이라 주소는 보여 드리지 않습니다. 사람을 찾는 데 쓰일 수 있어서입니다. 필요하면 아래 ‘구글 렌즈로 같은 사진 찾기’로 직접 확인해 보세요.'
      : ` 이 가운데 ${n}곳은 SNS 계정이라 주소를 보여 드리지 않습니다. 사람을 찾는 데 쓰일 수 있어서입니다.`;
  };
  if (w.fullPages.length) {
    signals.push({
      level: 'signal',
      title: `같은 사진이 다른 웹페이지 ${w.fullPages.length}곳에 있습니다`,
      text: `상대가 보낸 사진과 같은 사진이 다른 곳에 올라가 있습니다. 다른 사람의 사진을 가져다 쓰는 경우가 많으니, 그 사진 속 인물과 상대가 같은 사람인지 영상통화로 확인해 보세요.${hidden(w.fullPages)}`,
      sources: src(w.fullPages),
    });
  } else if (w.partialPages.length) {
    signals.push({
      level: 'note',
      title: `비슷하게 잘리거나 고친 사진이 ${w.partialPages.length}곳에 있습니다`,
      text: `완전히 같은 사진은 아니지만 일부가 같은 사진이 있습니다. 같은 사람의 다른 사진일 수도 있으니 직접 열어 확인해 보세요.${hidden(w.partialPages)}`,
      sources: src(w.partialPages),
    });
  } else {
    facts.push({ text: '공개 웹에서 같은 사진을 찾지 못했습니다. 비공개 계정이나 메신저에서만 쓰인 사진은 찾을 수 없습니다.' });
  }
  return { signals, facts };
}

// 같은 사진 웹 검색(구글 Vision) — 같은 사진이 다른 웹페이지에 있으면 도용 흔적으로 짚는다
async function webPart(out, photo, notes) {
  if (!visionReady()) {
    out.pending.push({ label: '같은 사진 웹 검색', text: '구글 이미지 검색 연동 뒤 같은 사진이 올라간 웹페이지를 자동으로 찾습니다. 지금은 아래 버튼으로 직접 찾아볼 수 있습니다.' });
    return;
  }
  try {
    const w = await webDetect(photo);
    if (!w) return;
    const m = photoMatches(w);
    out.signals.push(...m.signals);
    out.facts.push(...m.facts);
  } catch {
    out.pending.push(busy('같은 사진 웹 검색', '구글 이미지 검색', '지금 바로 보려면 아래 ‘구글 렌즈로 같은 사진 찾기’에 사진을 올려 직접 찾아볼 수 있어요.'));
  }
}

// 같은 사진 웹 검색과 AI 사진 관찰은 서로 기다리지 않는다. AI 는 남은 시간 안에서만 —
// 캡처·사진이 함께 오면 40초 고정 대기 탓에 함수 60초를 넘어 결과를 통째로 잃던 것(2026-10-27)
async function photoPart(photo, notes, deadline) {
  const out = { signals: [], facts: [], pending: [], links: [LINKS.lens, LINKS.tineye] };
  const aiFailed = () => notes.push('사진 관찰 AI가 잠시 응답하지 않아, 사진 속 다른 사이트 표시나 워터마크 같은 흔적은 살펴보지 못했습니다. 같은 사진 웹 검색 결과는 그대로 보여 드립니다.');
  const timeout = Math.max(5000, Math.min(25000, deadline - Date.now() - 2000));
  const [, o] = await Promise.all([
    webPart(out, photo, notes),
    aiReady() ? inspectPhoto(photo, { timeout }).catch(() => { aiFailed(); return null; }) : null,
  ]);
  try {
    if (!o) return out;
    // by: 'ai' — 생성형 AI(제미나이)가 관찰·작성한 결과. 화면에 'AI 생성' 표시를 붙인다(AI기본법 제31조 제2항, 2026-01-22 시행)
    if (o.screenshot?.found) out.signals.push({ level: 'signal', title: '다른 사이트 사용 흔적', text: o.screenshot.detail || '다른 앱이나 SNS 화면을 캡처한 흔적이 보입니다.', by: 'ai' });
    if (o.watermark?.found) out.signals.push({ level: 'signal', title: '다른 사이트 사용 흔적', text: noHandle(o.watermark.detail) || '사진에 다른 계정이나 사이트 표시가 보입니다.', by: 'ai' });
    if (o.uniform?.found) out.signals.push({ level: 'note', title: '직업을 드러내는 옷차림 사진입니다', text: `${dot(o.uniform.detail)} 군복·의사 가운 사진은 로맨스스캠에서 자주 쓰입니다. 이것만으로 판단할 수는 없습니다.`.trim(), by: 'ai' });
    // 공개 행사 사진 — 유명인이나 다른 사람의 행사 사진을 가져다 쓰는 경우가 많다
    if (o.event?.found) out.signals.push({ level: 'note', title: '공개 행사에서 찍힌 사진입니다', text: `${dot(o.event.detail)} 유명인이나 다른 사람의 행사 사진을 가져다 쓰는 경우가 많으니, 같은 사진이 다른 곳에 있는지 함께 확인하세요.`.trim(), by: 'ai' });
    if (o.professional?.found) out.signals.push({ level: 'note', title: '화보처럼 보정된 사진입니다', text: o.professional.detail || '광고·화보 사진처럼 보입니다. 같은 사진이 다른 곳에 있는지 찾아보세요.', by: 'ai' });
    if (o.quality?.found) out.signals.push({ level: 'note', title: '여러 번 저장된 흔적이 있습니다', text: o.quality.detail || '화질이 낮거나 잘린 흔적이 있습니다.', by: 'ai' });
    if (!out.signals.some((s) => !s.sources)) out.facts.push({ text: '사진에서 다른 사이트 화면이나 워터마크 같은 흔적은 보이지 않습니다.', by: 'ai' });
  } catch {
    aiFailed();
  }
  return out;
}

// 대화 순서 정리(정밀 분석) — 상대가 한 말 가운데 AI 가 확인 신호로 짚은 말만 순서대로. '처음 돈 이야기'는 금전요구로 짚은 첫 말.
// 금액은 그 줄에 적힌 것을 보여 주기만 한다(금액 글자만으로 줄을 만들지 않는다 — 밥값 이야기까지 걸려서, 2026-10-26)
const AMOUNT = /(\d[\d,.]*\s*(만\s*원|천\s*원|억\s*원?|원|달러|불|USDT|테더|BTC|비트코인))/i;
export function buildTimeline(chat, items) {
  const lines = String(chat || '').split('\n').map((t) => t.trim()).filter(Boolean);
  const marked = lines.some((l) => /^(나|상대)\s*[:：]/.test(l));
  const quotes = [];
  for (const it of items) {
    if (!CHAT_IDS.includes(it.id)) continue;
    for (const sg of it.signals || []) for (const e of sg.evidence || []) if (e?.match?.trim().length >= 2) quotes.push({ q: e.match.trim(), title: sg.title, money: it.id === 'money' });
  }
  const rows = [];
  lines.forEach((l, i) => {
    if (marked && !/^상대\s*[:：]/.test(l)) return;
    const text = l.replace(/^상대\s*[:：]\s*/, '');
    const hits = quotes.filter((x) => text.includes(x.q));
    if (!hits.length) return;
    const amount = (text.match(AMOUNT) || [])[0] || null;
    rows.push({ n: i + 1, text: text.length > 140 ? `${text.slice(0, 140)}…` : text, tags: [...new Set(hits.map((x) => x.title))].slice(0, 2), amount, money: hits.some((x) => x.money) });
  });
  const first = rows.find((r) => r.money);
  if (first) first.firstMoney = true;
  return { total: lines.length, rows: rows.slice(0, 30) };
}

// 신고용 정리본에 넣을 상대방 정보 — 이용자가 넣은 것만, 보기 좋은 모양으로
function subjectOf(input, parts) {
  const phoneCopy = parts.phone?.links?.find((l) => l.copy)?.copy || '';
  return {
    phone: phoneCopy,
    account: input.account ? `${input.bank ? `${input.bank} ` : ''}${input.account}` : '',
    url: input.url || '',
    company: input.company || '',
    biz: input.biz ? input.biz.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3') : '',
    job: [input.job, input.workplace].filter(Boolean).join(', '),
  };
}

export async function runAnalysis(raw) {
  const input = cleanInput(raw);
  const notes = [];
  const deadline = Date.now() + 52000; // 서버 함수는 60초 — AI 를 다시 묻더라도 이 안에서
  // 대화와 관계없는 검사는 캡처 읽기(최대 25초)를 기다리지 않고 바로 시작한다(2026-10-27)
  const base = { ...input, chat: input.chatText };
  const on = (id) => CHECKS.find((c) => c.id === id).needs(base);
  const early = Promise.all([
    on('phone') ? phonePart(input.phone) : null,
    on('account') ? accountPart(input.account, input.bank) : null,
    on('photo') ? photoPart(input.photo, notes, deadline) : null,
    on('biz') ? bizPart(input.biz) : null,
    on('commerce') ? commercePart(input.biz, input.url) : null,
    // 다니는 회사와 운영하는 사업체는 다른 곳이라 사업자번호와 대조하지 않는다
    on('company') ? companyPart(input.company) : null,
    on('job') ? jobPart(input.job, input.workplace) : null,
  ]);
  early.catch(() => {}); // 캡처를 읽는 동안 실패해도 처리되지 않은 거절로 함수가 죽지 않게 — 아래에서 다시 기다린다
  // 캡처는 글로 옮겨 대화에 합친다
  let chat = input.chatText;
  let ocrLines = 0;
  if (input.chatImages.length) {
    if (aiReady()) {
      try {
        const lines = await ocrChat(input.chatImages, { timeout: 25000 });
        ocrLines = lines.length;
        if (!lines.length && !input.chatText) notes.push('올린 캡처에서 대화 글자를 찾지 못해 대화 분석을 하지 못했습니다. 대화 화면을 캡처한 사진이 맞는지 확인하거나, 대화를 글로 복사해 붙여 넣어 주세요.');
        chat = [chat, lines.join('\n')].filter(Boolean).join('\n');
      } catch {
        notes.push('대화 캡처의 글자를 읽는 AI가 잠시 응답하지 않았습니다. 대화를 글로 복사해 붙여 넣으면 바로 분석할 수 있고, 잠시 뒤 캡처로 다시 점검해도 됩니다.');
      }
    } else {
      notes.push('대화 캡처 읽기는 아직 준비 중입니다. 대화를 글로 복사해 붙여 넣으면 분석할 수 있습니다.');
    }
  }
  const view = { ...input, chat };
  const checkable = Object.fromEntries(CHECKS.map((c) => [c.id, c.needs(view)]));

  // 9번 링크의 '말한 운영 기간'·'코인 거래소 권유'는 대화 분석에서 AI 가 읽은 값으로 — 대화가 없으면 묻지 않는다
  const chatRun = chat ? chatParts(chat, input, notes, deadline) : null;
  const hints = chatRun ? chatRun.then((r) => r.hints, () => NO_HINTS) : Promise.resolve(NO_HINTS);
  const [[phone, account, photo, biz, commerce, company, job], chatR, link] = await Promise.all([
    early,
    chatRun,
    checkable.link ? linkPart({ url: input.url, chat, hints }) : null,
  ]);
  const parts = { phone, account, photo, link, biz, commerce, company, job, ...(chatR?.parts || {}) };
  const items = CHECKS.map((def) => finalize(def, checkable[def.id], parts[def.id] || {}));

  // 어떤 원본을 받았는지 개수만 남긴다 (자동파기 현황용)
  const originals = ['phone', 'account', 'chatText', 'photo', 'url', 'company', 'biz'].filter((k) => input[k]).length + input.chatImages.length;

  return {
    items,
    totals: {
      total: CHECKS.length,
      checkable: items.filter((i) => i.checkable).length,
      signals: items.reduce((s, i) => s + (i.signalCount || 0), 0),
      notes: items.reduce((s, i) => s + (i.noteCount || 0), 0),
    },
    meta: { ocrLines, notes, ai: aiReady(), provided: Object.keys(input).filter((k) => (Array.isArray(input[k]) ? input[k].length : input[k])) },
    timeline: chat ? buildTimeline(chat, items) : null,
    subject: subjectOf(input, parts),
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

// 고른 요금제에 맞춰 리포트를 연다. 무료 점검(예전 Standard 포함)은 정밀 분석 항목과 대화 순서 정리를 잠근다.
export function reportOf(result, plan, { casefile = false } = {}) {
  const full = plan === 'full';
  const items = result.items.map((it) => (!full && it.plan === 'full' && it.checkable
    ? { id: it.id, no: it.no, title: it.title, plan: it.plan, sources: it.sources, checkable: true, status: it.status, signalCount: it.signalCount || 0, noteCount: it.noteCount || 0, locked: true }
    : it));
  const tl = result.timeline;
  return {
    plan: full ? 'full' : 'free',
    totals: result.totals,
    meta: { notes: result.meta.notes, ocrLines: result.meta.ocrLines, ai: result.meta.ai },
    items,
    // 대화 순서 정리는 정밀 분석에서만. 무료 점검에는 몇 줄을 찾았는지만
    timeline: tl ? (full ? tl : { total: tl.total, rows: [], locked: true, count: tl.rows.length }) : null,
    casefile: casefile ? { subject: result.subject || {} } : null,
  };
}
