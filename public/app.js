// DATE CHECK 화면 — 첫 화면 연출, 팝업 단계 입력(STEP 1~6), 리포트(STEP 7~8)
// 바깥에서 온 글(검색 결과·대화)은 반드시 textContent 로만 넣는다.
import { isSnsUrl, companyName } from '/parse-input.js';

const $ =(s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
const wrapText = (root) => window.__wrap && window.__wrap(root);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : null);
const ext = (url, text, cls) => (safeUrl(url) ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: cls }, text) : h('span', { class: cls }, text));
const pad2 = (n) => String(n).padStart(2, '0');
// 로고 표식 (public/logo-mark.svg 와 같은 모양)
const MARK_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#E8506A" stroke="#E8506A" stroke-linejoin="round"><rect x="4" y="6" width="56" height="42" rx="14" stroke-width="0"/><path d="M15 42 L15.5 57 L31 45 Z" stroke-width="3"/></g><polyline points="19.5,27.5 28,35.5 44.5,18.5" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function logoMark() {
  const s = document.createElement('span');
  s.className = 'logo-mark';
  s.innerHTML = MARK_SVG;
  return s;
}

// 줄바꿈 런타임을 거치지 않는 짧은 글: 가운뎃점·빗금·숫자 하이픈에서 꺾이지 않게 묶는다
const WJ = String.fromCharCode(0x2060);
const glue = (s) => String(s || '').replace(/([^\s⁠])([·ㆍ/])(?=[^\s⁠])/g, '$1' + WJ + '$2' + WJ).replace(/(\d)-(?=\d)/g, '$1' + WJ + '-' + WJ);
// 화면을 그린 뒤 런타임(.w) 밖의 글자도 같은 방식으로 묶는다
function glueText(root = document.body) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('.w, script, style, textarea, input, .srcs, .quote, .cpy') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const g = glue(n.data);
    if (g !== n.data) n.data = g;
  }
}

// ---------- 방문자·이벤트 ----------
// 저장이 막힌 브라우저(시크릿 모드·저장 차단)에서도 화면이 멈추지 않게 — 그때는 이번 방문에서만 쓰는 아이디
let storageOk = true;
let visitor = '';
try { visitor = localStorage.getItem('dc-visitor') || ''; } catch { storageOk = false; }
if (!visitor) {
  visitor = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem('dc-visitor', visitor); } catch { storageOk = false; }
}
function track(type) {
  fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, visitor }), keepalive: true }).catch(() => {});
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('long', String(msg).length > 34);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), Math.max(2600, String(msg).length * 90));
}

// ---------- 서버와 주고받기: 어떤 실패든 쉬운 말과 할 일로 바꿔 던진다 (2026-10-26 오너: 모든 오류에 친절한 안내) ----------
const NET = {
  offline: '인터넷 연결이 끊긴 것 같아요. 와이파이나 데이터 연결을 확인한 뒤 다시 눌러 주세요.',
  unreachable: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요.',
  timeout: '서버 응답이 너무 늦어요. 잠시 뒤 다시 눌러 주세요.',
  busy: '서버가 잠시 바빠요. 1분쯤 뒤 다시 눌러 주세요. 계속 안 되면 화면 맨 아래 ‘삭제 요청·문의·신고’로 알려 주세요.',
  tooLarge: '올린 사진이 너무 커서 보내지 못했어요. 캡처를 몇 장 빼고 다시 시도해 주세요.',
};
async function api(path, { body, timeout = 20000, headers = {} } = {}) {
  if (navigator.onLine === false) throw Object.assign(new Error(NET.offline), { network: true });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(path, body === undefined
      ? { headers, signal: ctl.signal }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), signal: ctl.signal });
  } catch {
    throw Object.assign(new Error(ctl.signal.aborted ? NET.timeout : navigator.onLine === false ? NET.offline : NET.unreachable), { network: true });
  } finally {
    clearTimeout(timer);
  }
  let j = null;
  try { j = await r.json(); } catch { /* JSON 이 아닌 답 — 관문 오류 화면 등 */ }
  if (!r.ok) throw Object.assign(new Error(j?.error || (r.status === 413 ? NET.tooLarge : r.status === 504 ? NET.timeout : NET.busy)), { status: r.status });
  if (!j) throw Object.assign(new Error(NET.busy), { status: r.status });
  return j;
}

// 예상 못 한 화면 오류 — 우리 코드에서 난 것만, 8초에 한 번
let crashAt = 0;
function crashed() {
  if (Date.now() - crashAt < 8000) return;
  crashAt = Date.now();
  toast('화면에 문제가 생겼어요. 새로고침하면 대부분 해결돼요.');
}
addEventListener('error', (e) => { if (String(e.filename || '').startsWith(location.origin)) crashed(); });
addEventListener('unhandledrejection', (e) => { if (/\/app\.js/.test(String(e.reason?.stack || ''))) crashed(); });

// 설정(검사 항목·가격) — 못 받으면 점검을 시작할 수 없어 다시 받는다
async function loadConfig() {
  try {
    const c = await api(`/api/config?v=${visitor}`, { headers: { 'x-visitor': visitor }, timeout: 12000 });
    if (!Array.isArray(c.checks) || !c.checks.length) return false;
    CONFIG = c;
    return true;
  } catch {
    return false;
  }
}

function countUp(el, to, dur = 1100) {
  if (reduce || !to) { el.textContent = to.toLocaleString('ko-KR'); return; }
  const t0 = performance.now();
  const f = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4))).toLocaleString('ko-KR');
    if (p < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

// ---------- 설정 (항목 이름·요금은 서버 한 곳에서) ----------
let CONFIG = { checks: [], plans: {}, addons: {}, jobs: [], official: [] };
const NEED = {
  phone: { need: '전화번호', g: 'contact' },
  account: { need: '계좌번호', g: 'contact' },
  money: { need: '카톡·DM 대화', g: 'chat' },
  invest: { need: '카톡·DM 대화', g: 'chat' },
  privacy: { need: '카톡·DM 대화', g: 'chat' },
  avoid: { need: '카톡·DM 대화', g: 'chat' },
  mismatch: { need: '대화와 상대가 한 말', g: 'chat' },
  photo: { need: '상대방 사진', g: 'photo' },
  link: { need: '상대가 보낸 사이트 주소', g: 'link' },
  biz: { need: '사업자등록번호', g: 'biz' },
  commerce: { need: '사업자번호 또는 상호', g: 'biz' },
  company: { need: '회사명 또는 상호', g: 'biz' },
  job: { need: '직업', g: 'biz' },
};
// 2026-10-22 오너 결정 — 무료 점검 + 정밀 분석(방문자마다 시험 가격) + 신고용 정리본·재검사
const won = (p) => `${Number(p).toLocaleString('ko-KR')}원`;
const priceText = (plan) => {
  if (plan === 'free') return '0원';
  const p = CONFIG.plans?.[plan]?.price ?? CONFIG.addons?.[plan]?.price;
  return p ? won(p) : '가격 미정';
};
const planLabel = (plan) => (plan === 'full' ? '정밀 분석' : '무료 점검');
const checkTitle = (id) => CONFIG.checks.find((c) => c.id === id)?.title || '';

// =====================================================================
// 첫 화면
// =====================================================================
function initLanding() {
  // 머리 띠
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40 || !$('#report-view').hidden);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 나타나기
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach((c) => { if (!c.dataset.done) { c.dataset.done = 1; countUp(c, Number(c.dataset.count)); } });
      io.unobserve(e.target);
    }
  }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
  $$('.rv').forEach((el, i) => { el.style.setProperty('--d', `${(i % 4) * 0.07}s`); io.observe(el); });
  window.__observe = (el) => io.observe(el);

  // 사진 천천히 움직이기
  const par = $$('[data-parallax]');
  const zoom = $('[data-zoom]');
  let ticking = false;
  const move = () => {
    ticking = false;
    const vh = innerHeight;
    for (const el of par) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      el.style.transform = `translate3d(0, ${(-r.top * Number(el.dataset.parallax)).toFixed(1)}px, 0)`;
    }
    if (zoom) {
      const r = zoom.parentElement.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, 1 - r.top / vh));
      zoom.querySelector('img').style.setProperty('--z', (1.15 - p * 0.15).toFixed(3));
    }
  };
  if (!reduce) addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(move); } }, { passive: true });
  move();

  // 진행 방식 선 그리기
  const steps = $('#steps');
  new IntersectionObserver((es, o) => {
    if (!es[0].isIntersecting) return;
    o.disconnect();
    steps.style.setProperty('--p', 1);
    $$('.step', steps).forEach((s, i) => setTimeout(() => s.classList.add('on'), reduce ? 0 : 250 + i * 380));
  }, { threshold: 0.3 }).observe(steps);

  // 흐르는 띠: 넓은 화면에서도 빈틈없이 돌도록 화면 폭보다 길게 이어 붙인다
  const mTrack = $('.marquee-track');
  const base = [...mTrack.children].filter((n) => !n.hasAttribute('aria-hidden')).map((n) => n.cloneNode(true));
  let marqueeW = 0;
  const fillMarquee = () => {
    if (Math.abs(innerWidth - marqueeW) < 2) return;
    // 리포트 화면처럼 띠가 숨겨져 폭을 잴 수 없으면 건너뛴다 (0 으로 나누면 끝없이 이어 붙임)
    if (!mTrack.offsetParent) { marqueeW = 0; return; }
    marqueeW = innerWidth;
    mTrack.replaceChildren(...base.map((n) => n.cloneNode(true)));
    const copyW = mTrack.scrollWidth;
    if (copyW < 100) { marqueeW = 0; return; }
    const copies = Math.max(2, Math.ceil(innerWidth / copyW) + 1);
    for (let c = 1; c < copies; c += 1) {
      base.forEach((n) => { const k = n.cloneNode(true); k.setAttribute('aria-hidden', 'true'); mTrack.append(k); });
    }
    mTrack.style.setProperty('--copy', `${copyW}px`);
    mTrack.style.animationDuration = `${Math.round(copyW / 45)}s`;
  };
  fillMarquee();
  window.__fillMarquee = () => { marqueeW = 0; fillMarquee(); };
  let mq = null;
  addEventListener('resize', () => { clearTimeout(mq); mq = setTimeout(fillMarquee, 200); });
  document.fonts?.ready.then(() => { marqueeW = 0; fillMarquee(); });

  // 폰 메뉴
  const burger = $('.nav-burger');
  const mnav = $('#mnav');
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    mnav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    if (open) nav.classList.add('solid'); else onScroll();
  };
  burger.addEventListener('click', () => setMenu(!mnav.classList.contains('open')));
  mnav.addEventListener('click', (e) => { if (e.target.closest('a, button')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mnav.classList.contains('open')) setMenu(false); });
  addEventListener('resize', () => { if (innerWidth > 860 && mnav.classList.contains('open')) setMenu(false); });

  // 열기 단추
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-wizard]')) { e.preventDefault(); openWizard(); }
    if (e.target.closest('[data-open-request]')) openRequest();
    if (e.target.closest('[data-open-privacy]')) openPrivacy();
    const home = e.target.closest('[data-home]');
    if (home) { e.preventDefault(); navigate('/'); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }
    const a = e.target.closest('a[href^="/#"]');
    if (a && location.pathname !== '/') { e.preventDefault(); navigate('/'); setTimeout(() => $(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth' }), 60); }
  });

  initDemo();
  track('landing_view');
}

function renderCheckGrid() {
  const grid = $('#check-grid');
  grid.replaceChildren(...CONFIG.checks.map((c, i) => {
    const n = NEED[c.id] || {};
    const card = h('article', { class: 'ck rv', 'data-g': n.g, style: `--d:${(i % 4) * 0.06}s` },
      h('span', { class: 'ck-no' }, pad2(c.no)),
      h('span', { class: `ck-plan ${c.plan}` }, c.plan === 'full' ? '정밀 분석' : '무료'),
      h('h3', {}, c.title),
      h('p', { class: 'ck-need' }, h('b', {}, '필요한 정보 '), n.need || ''),
      h('div', { class: 'tags' }, c.sources.map((s) => h('span', {}, s))));
    window.__observe?.(card);
    return card;
  }));
  // STEP 8 — 공식 조회로만 연결하는 것 (격자 마지막 빈칸을 채운다)
  const off = h('article', { class: 'ck ck-off rv', 'data-g': 'official' },
    h('span', { class: 'ck-no' }, '공식 조회 연결'),
    h('h3', {}, '저장하지 않고 공식 서비스로 바로 연결합니다'),
    h('p', { class: 'ck-need w' }, '성범죄자 공개정보와 경찰 사이버사기 신고 이력, 스미싱 확인은 필요할 때 공식 조회 버튼으로 안내합니다.'),
    h('div', { class: 'tags' }, (CONFIG.official || []).map((o) => h('span', {}, o.label))));
  grid.append(off);
  window.__observe?.(off);
  $$('.filters button').forEach((b) => b.addEventListener('click', () => {
    $$('.filters button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    const f = b.dataset.f;
    $$('.ck', grid).forEach((card) => card.classList.toggle('dim', f !== 'all' && card.dataset.g !== f));
  }));
  $$('[data-price]').forEach((el) => { el.textContent = priceText(el.dataset.price); });
}

// ---------- 미리 보기: 대화에서 신호 찾기 ----------
const DEMO = [
  { t: '오늘 하루는 어땠어요?' },
  { me: true, t: '좋았어요. 우리 영상통화 한번 해요' },
  { t: '지금 해외 파견 중이라 보안 때문에 영상통화는 어려워요', mark: '영상통화는 어려워요', cat: '만남·영상통화 회피', why: '영상통화를 피하는 말' },
  { t: '제가 쓰는 거래소가 있는데 원금 보장이에요', mark: '원금 보장', cat: '투자유도', why: '수익을 보장한다는 말' },
  { t: '출금하려면 수수료를 먼저 보내야 해요', mark: '수수료를 먼저 보내야', cat: '금전요구', why: '먼저 돈을 내라는 말' },
  { t: '여기 말고 텔레그램으로 옮겨서 얘기해요', mark: '텔레그램으로 옮겨서', cat: '로맨스스캠 패턴', why: '다른 메신저로 옮기자는 말' },
];
function initDemo() {
  const chat = $('#demo-chat');
  const list = $('#demo-list');
  const num = $('#demo-n');
  const scan = $('.phone-scan');
  let run = 0;
  const bubble = (m) => {
    const b = h('div', { class: `bub${m.me ? ' me' : ''}` });
    if (m.mark) {
      const [a, z] = m.t.split(m.mark);
      b.append(a, h('mark', {}, m.mark), z);
    } else b.textContent = m.t;
    return b;
  };
  async function play() {
    const id = ++run;
    chat.replaceChildren();
    list.replaceChildren();
    num.textContent = '0';
    scan.classList.remove('go');
    const marks = [];
    for (const m of DEMO) {
      if (id !== run) return;
      if (!m.me) {
        const typing = h('div', { class: 'typing' }, h('i'), h('i'), h('i'));
        chat.append(typing);
        await sleep(650);
        typing.remove();
      }
      if (id !== run) return;
      const b = bubble(m);
      chat.append(b);
      if (m.mark) marks.push([b, m]);
      await sleep(m.me ? 600 : 420);
    }
    await sleep(300);
    if (id !== run) return;
    void scan.offsetWidth;
    scan.classList.add('go');
    await sleep(1100);
    let n = 0;
    for (const [b, m] of marks) {
      if (id !== run) return;
      b.querySelector('mark').classList.add('on');
      list.append(h('li', {}, h('b', {}, m.cat), h('span', {}, `“${m.mark}” ${m.why}`)));
      num.textContent = String(++n);
      await sleep(650);
    }
  }
  $('#demo-replay').addEventListener('click', play);
  new IntersectionObserver((es, o) => {
    if (!es[0].isIntersecting) return;
    o.disconnect();
    play();
  }, { threshold: 0.35 }).observe($('#demo'));
}

// =====================================================================
// 입력 팝업
// =====================================================================
const INPUTS = [
  { key: 'phone', label: '전화번호', desc: '상대가 알려 준 번호' },
  { key: 'chat', label: '카톡·DM 대화', desc: '캡처 또는 글 붙여넣기' },
  { key: 'photo', label: '상대방 사진', desc: '프로필 사진 한 장' },
  { key: 'account', label: '계좌번호', desc: '돈을 보내 달라고 한 계좌' },
  { key: 'url', label: '상대방이 보낸 URL', desc: '받은 링크, 투자·쇼핑 사이트' },
  { key: 'company', label: '회사명·직업', desc: '다닌다고 한 회사와 직업' },
  { key: 'biz', label: '사업자등록번호', desc: '운영한다는 사업체 번호' },
  { key: 'shop', label: '쇼핑몰·사업체명', desc: '운영한다고 한 곳' },
  { key: 'claims', label: '상대가 직접 말한 정보', desc: '사는 곳, 경력, 운영 기간' },
  // '이름'은 2026-10-26 뺐다 — 분석에 쓰지 않는 정보라 받지 않는다(개인정보 최소 수집, 법 제16조)
];
const STEP_LABEL = { select: '받은 것 선택', confirm: '입력 확인', run: '점검', preview: '점검 결과', pay: '결제' };
const BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국', '수협', '신협', 'SC제일', '부산', '경남', 'iM뱅크', '광주', '전북', '제주', '기타'];
const CLAIM_HINTS = ['서울에 산다고 했어요', '해외에서 일한다고 했어요', '회사를 5년째 운영 중이라고 했어요', '돈이 급하다고 했어요'];

const freshValues = () => ({ phone: '', account: '', bank: '', chatText: '', chatImages: [], chatMode: 'image', photo: '', url: '', company: '', job: '', workplace: '', biz: '', shop: '', shopUrl: '', claims: '' });
const W = { sel: new Set(), v: freshValues(), steps: ['select'], i: 0, consent: [false, false], id: null, preview: null, plan: 'full', opened: false, lastFocus: null };

const digits = (s) => String(s || '').replace(/\D/g, '');
function fmtPhone(v) {
  if (/^\s*\+/.test(v)) return v.replace(/[^\d+\s-]/g, '');
  const d = digits(v).slice(0, 11);
  if (d.startsWith('02')) return d.length < 3 ? d : d.length < 6 ? `${d.slice(0, 2)}-${d.slice(2)}` : d.length < 10 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
function fmtBiz(v) {
  const d = digits(v).slice(0, 10);
  return d.length < 4 ? d : d.length < 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
function bizOk(d) {
  if (!/^\d{10}$/.test(d)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i += 1) s += Number(d[i]) * w[i];
  s += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (s % 10)) % 10 === Number(d[9]);
}
// SNS·영상·블로그 주소는 확인하지 않는다(2026-10-26) — 사이트 주소만 센다
const URL_IN = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|kr|io|xyz|top|vip|co|me|app|site|shop)\b\S*)/gi;
const hasUrlIn = (t) => (String(t || '').match(URL_IN) || []).some((u) => !isSnsUrl(u));
const siteUrls = (t) => String(t || '').split(/[\s,]+/).filter((u) => /\.[a-z]{2,}/i.test(u) && !isSnsUrl(u));

// 선택만 보고 어림한 검사 가능 항목 (STEP 4 미리 보기)
function estimateIds() {
  const s = (k) => W.sel.has(k);
  const ids = [];
  if (s('phone')) ids.push('phone');
  if (s('account')) ids.push('account');
  if (s('chat')) ids.push('money', 'invest', 'privacy', 'avoid');
  if (s('chat') && (s('claims') || s('company'))) ids.push('mismatch');
  if (s('photo')) ids.push('photo');
  if (s('url') || s('shop')) ids.push('link');
  if (s('biz')) ids.push('biz');
  if (s('biz') || s('shop')) ids.push('commerce');
  if (s('company') || s('shop')) ids.push('company');
  if (s('company')) ids.push('job');
  return ids;
}
// 실제 입력값으로 정확히 센 검사 가능 항목 (서버 needs 와 같은 규칙)
function exactIds() {
  const v = W.val();
  const chat = Boolean(v.chatText || v.chatImages.length);
  const ids = [];
  if (v.phone) ids.push('phone');
  if (v.account) ids.push('account');
  if (chat) ids.push('money', 'invest', 'privacy', 'avoid');
  if (chat && (v.claims || v.company || v.job)) ids.push('mismatch');
  if (v.photo) ids.push('photo');
  if (siteUrls(v.url).length || hasUrlIn(v.chatText)) ids.push('link');
  if (v.biz) ids.push('biz');
  if (v.biz || v.shop) ids.push('commerce');
  if (v.company || v.shop) ids.push('company');
  if (v.job) ids.push('job');
  return CONFIG.checks.filter((c) => ids.includes(c.id)).map((c) => c.id);
}
// 고른 정보만 서버로 보낸다
W.val = () => {
  const v = W.v;
  const on = (k) => W.sel.has(k);
  const url = [on('url') ? v.url : '', on('shop') ? v.shopUrl : ''].filter(Boolean).join('\n');
  return {
    phone: on('phone') ? v.phone.trim() : '',
    account: on('account') ? digits(v.account) : '',
    bank: on('account') ? v.bank : '',
    chatText: on('chat') && v.chatMode === 'text' ? v.chatText.trim() : '',
    chatImages: on('chat') && v.chatMode === 'image' ? v.chatImages : [],
    photo: on('photo') ? v.photo : '',
    url: url.trim(),
    company: on('company') ? v.company.trim() : '',
    job: on('company') ? v.job : '',
    workplace: on('company') ? v.workplace.trim() : '',
    biz: on('biz') ? digits(v.biz) : '',
    shop: on('shop') ? v.shop.trim() : '',
    claims: on('claims') ? v.claims.trim() : '',
  };
};

function buildSteps() {
  W.steps = ['select', ...INPUTS.map((x) => x.key).filter((k) => W.sel.has(k)), 'confirm', 'run', 'preview', 'pay'];
}
const curStep = () => W.steps[W.i];

// 사진 줄이기 — 캡처 글씨가 읽히도록 긴 변 2000px, 프로필 사진은 1280px
async function compress(file, max, quality = 0.85) {
  if (!String(file?.type || '').startsWith('image/')) throw new Error('사진 파일만 올릴 수 있어요. JPG나 PNG 사진을 골라 주세요.');
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('이 사진은 브라우저에서 열 수 없는 형식이에요(아이폰 HEIC 등). 화면을 스크린샷으로 다시 찍거나 JPG로 바꿔 올려 주세요.');
  }
  try {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch {
    throw new Error('사진이 너무 커서 줄이지 못했어요. 스크린샷으로 다시 찍어 올려 주세요.');
  }
}

async function openWizard() {
  if (!CONFIG.checks.length && !(await loadConfig())) {
    const close = sheet(h('h2', {}, '지금은 점검을 시작할 수 없어요'),
      h('p', { class: 'w' }, navigator.onLine === false ? NET.offline : '서버에서 검사 항목을 받아 오지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요.'),
      h('button', { class: 'btn btn-rose', type: 'button', style: 'width:100%', onclick: () => { close(); openWizard(); } }, '다시 시도'));
    return;
  }
  const box = $('#wizard');
  if (!W.opened) {
    W.opened = true;
    track('wizard_open');
  }
  W.lastFocus = document.activeElement;
  box.hidden = false;
  box.classList.remove('closing');
  document.body.classList.add('lock');
  buildShell();
  renderStep(0);
}

function closeWizard() {
  const box = $('#wizard');
  if (box.hidden) return;
  box.classList.add('closing');
  setTimeout(() => {
    box.hidden = true;
    box.replaceChildren();
    document.body.classList.remove('lock');
    W.lastFocus?.focus?.();
  }, reduce ? 0 : 280);
}

function resetWizard() {
  W.sel = new Set();
  W.v = freshValues();
  W.steps = ['select'];
  W.i = 0;
  W.consent = [false, false];
  W.id = null;
  W.token = null;
  W.preview = null;
  W.plan = 'full';
  W.recheckToken = null;
  W.opened = false;
}

function buildShell() {
  const box = $('#wizard');
  box.replaceChildren(
    h('div', { class: 'wz-backdrop', onclick: closeWizard }),
    h('div', { class: 'wz-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wz-title' },
      h('aside', { class: 'wz-side' },
        h('span', { class: 'logo' }, logoMark(), h('span', { class: 'logo-a' }, 'DATE'), h('span', { class: 'logo-b' }, 'CHECK')),
        h('ol', { class: 'wz-track', id: 'wz-track' }),
        h('div', { class: 'wz-meter' },
          h('p', {}, '13개 항목 중'),
          h('p', {}, h('b', { id: 'wz-meter-n' }, '0'), '개 검사 가능'),
          h('div', { class: 'bar' }, h('i', { id: 'wz-meter-bar', style: 'width:0%' })))),
      h('div', { class: 'wz-main' },
        h('div', { class: 'wz-head' },
          h('span', { class: 'count', id: 'wz-count' }),
          h('div', { class: 'wz-progress' }, h('i', { id: 'wz-prog', style: 'width:0%' })),
          h('span', { class: 'wz-mmeter', id: 'wz-mmeter' }),
          h('button', { class: 'wz-x', type: 'button', 'aria-label': '닫기', onclick: closeWizard }, '×')),
        h('div', { class: 'wz-body', id: 'wz-body' }),
        h('div', { class: 'wz-foot', id: 'wz-foot' }))),
  );
  box.onkeydown = (e) => {
    if (e.key === 'Escape') closeWizard();
    if (e.key === 'Tab') {
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', box).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
}

function updateChrome() {
  const step = curStep();
  const track = $('#wz-track');
  if (track) {
    track.replaceChildren(...W.steps.filter((s) => s !== 'run').map((s, k) => {
      const idx = W.steps.indexOf(s);
      const label = STEP_LABEL[s] || INPUTS.find((x) => x.key === s)?.label;
      const cls = idx < W.i ? 'done' : idx === W.i || (step === 'run' && s === 'preview') ? 'cur' : '';
      return h('li', { class: cls }, h('i', { 'aria-hidden': 'true' }, idx < W.i ? '' : String(k + 1)), label);
    }));
  }
  // 입력하는 동안은 고른 정보 기준 어림값, 확인 단계부터는 실제 입력값 기준
  const confirmAt = W.steps.indexOf('confirm');
  const ids = confirmAt < 0 || W.i < confirmAt ? estimateIds() : exactIds();
  const n = $('#wz-meter-n');
  if (n) {
    n.textContent = String(ids.length);
    $('#wz-meter-bar').style.width = `${(ids.length / 13) * 100}%`;
  }
  $('#wz-mmeter').textContent = `${ids.length}/13 검사 가능`;
  // 왼쪽 단계 목록과 같은 번호 (사전분석 중 화면은 세지 않는다)
  const visible = W.steps.filter((s) => s !== 'run');
  const pos = visible.indexOf(step === 'run' ? 'preview' : step) + 1;
  $('#wz-count').textContent = `${pos} / ${visible.length}`;
  $('#wz-prog').style.width = `${(pos / visible.length) * 100}%`;
}

let pasteHandler = null;
function renderStep(dir) {
  const step = curStep();
  const view = STEPS[step]();
  const body = $('#wz-body');
  const stage = h('div', { class: `wz-stage ${dir > 0 ? 'enter-r' : dir < 0 ? 'enter-l' : ''}` }, view.body);
  body.replaceChildren(stage);
  body.scrollTop = 0;

  const foot = $('#wz-foot');
  const next = view.next ? h('button', { class: `btn ${view.next.rose ? 'btn-rose' : 'btn-navy'}`, type: 'button', id: 'wz-next', onclick: () => { if (!next.disabled) view.next.go(); } }, view.next.label) : null;
  // '다음'이 안 눌릴 때 이유를 한 줄로(view.next.why 가 있는 단계만, 무언가 입력한 뒤에)
  const why = h('p', { class: 'wz-why', 'aria-live': 'polite' });
  stage.append(why);
  const refresh = () => {
    if (next) next.disabled = !view.next.ok();
    why.textContent = next && next.disabled && view.next.why ? view.next.why() || '' : '';
    updateChrome();
  };
  view.refresh = refresh;
  foot.replaceChildren(...[
    view.back !== false && W.i > 0 ? h('button', { class: 'btn btn-line', type: 'button', onclick: () => go(view.backTo ? W.steps.indexOf(view.backTo) : W.i - 1, -1) }, '이전') : null,
    view.skip ? h('button', { class: 'link-btn skip-link', type: 'button', onclick: () => { W.sel.delete(step); buildSteps(); renderStep(1); } }, '건너뛰기') : null,
    h('span', { class: 'spacer' }),
    next,
  ].filter(Boolean));
  foot.hidden = !view.next && view.back === false;
  stage.addEventListener('input', refresh);
  stage.addEventListener('change', refresh);
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && next && !next.disabled) { e.preventDefault(); next.click(); }
  });
  W.refresh = refresh;
  refresh();
  glueText(stage);
  wrapText(stage);
  if (pasteHandler) document.removeEventListener('paste', pasteHandler);
  pasteHandler = view.onPaste || null;
  if (pasteHandler) document.addEventListener('paste', pasteHandler);
  const focusEl = view.focus || $('input:not([type=checkbox]):not([type=file]), textarea, .pick', stage);
  if (focusEl && matchMedia('(min-width: 901px)').matches) setTimeout(() => focusEl.focus({ preventScroll: true }), 80);
  view.after?.();
}

function go(i, dir = 1) {
  W.i = Math.max(0, Math.min(W.steps.length - 1, i));
  renderStep(dir);
}
const next = () => go(W.i + 1, 1);

function head(title, sub) {
  return [h('h2', { class: 'wz-title', id: 'wz-title' }, title), sub ? h('p', { class: 'wz-sub w' }, sub) : null];
}
function field(label, control, help) {
  return h('div', { class: 'fld' }, h('label', { for: control.id }, label), control, help || null);
}
function input(key, attrs = {}, format) {
  const el = h('input', { class: 'inp', id: `f-${key}`, type: 'text', autocomplete: 'off', ...attrs });
  el.value = W.v[key] || '';
  el.addEventListener('input', () => {
    if (format) {
      const f = format(el.value);
      if (f !== el.value) el.value = f;
    }
    W.v[key] = el.value;
  });
  return el;
}
function textarea(key, attrs = {}) {
  const el = h('textarea', { class: 'inp', id: `f-${key}`, ...attrs });
  el.value = W.v[key] || '';
  el.addEventListener('input', () => { W.v[key] = el.value; });
  return el;
}
function dropZone({ multiple, onFiles, title, sub }) {
  const file = h('input', { type: 'file', accept: 'image/*', multiple: multiple || false, hidden: true, onchange: (e) => { onFiles([...e.target.files]); e.target.value = ''; } });
  const zone = h('div', { class: 'drop', role: 'button', tabindex: '0', onclick: () => file.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } },
    h('b', {}, title), h('span', {}, sub), file);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files]); });
  return zone;
}
const pastedImages = (e) => [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);

const STEPS = {
  select() {
    const grid = h('div', { class: 'pick-grid' }, INPUTS.map((x) => h('button', {
      class: 'pick', type: 'button', 'aria-pressed': String(W.sel.has(x.key)),
      onclick: (e) => {
        const b = e.currentTarget;
        if (W.sel.has(x.key)) W.sel.delete(x.key); else W.sel.add(x.key);
        b.setAttribute('aria-pressed', String(W.sel.has(x.key)));
        buildSteps();
        W.refresh();
      },
    }, h('b', {}, x.label), h('span', {}, x.desc))));
    return {
      body: [...head('알고 있는 정보를 모두 골라 주세요', '많이 고를수록 검사할 수 있는 항목이 늘어납니다. 모든 정보를 넣을 필요는 없습니다.'), grid,
        h('p', { class: 'wz-hint w' }, '이름과 SNS 계정은 받지 않습니다. 사람을 찾는 일이 없도록 입력 칸을 두지 않았습니다.')],
      back: false,
      next: { label: '다음', ok: () => W.sel.size > 0, go: () => { buildSteps(); next(); } },
    };
  },

  phone() {
    const el = input('phone', { type: 'tel', inputmode: 'tel', placeholder: '010-1234-5678' }, fmtPhone);
    return {
      body: [...head('상대방 전화번호를 입력해 주세요', '상대에게 직접 받은 번호만 넣어 주세요. 해외 번호는 +로 시작하면 됩니다.'), field('전화번호', el)],
      skip: true,
      next: { label: '다음', ok: () => digits(W.v.phone).length >= 8, why: () => (digits(W.v.phone).length ? '번호가 짧아요. 숫자 8자리 이상 넣어 주세요.' : ''), go: next },
    };
  },


  chat() {
    const v = W.v;
    const thumbs = h('div', { class: 'thumbs' });
    const err = h('p', { class: 'err-msg' });
    const paint = () => thumbs.replaceChildren(...v.chatImages.map((src, k) => h('div', { class: 'thumb' }, h('img', { src, alt: `대화 캡처 ${k + 1}` }),
      h('button', { type: 'button', 'aria-label': '빼기', onclick: () => { v.chatImages.splice(k, 1); paint(); W.refresh(); } }, '×'))));
    const add = async (files) => {
      err.textContent = '';
      for (const f of files) {
        if (v.chatImages.length >= 6) { err.textContent = '캡처는 6장까지 올릴 수 있습니다.'; break; }
        try { v.chatImages.push(await compress(f, 1600, 0.82)); } catch (e) { err.textContent = e.message; }
      }
      paint();
      W.refresh();
    };
    const imgPane = h('div', {}, dropZone({ multiple: true, onFiles: add, title: '대화 캡처를 올려 주세요', sub: '여기에 끌어다 놓거나 눌러서 고릅니다. 붙여넣기도 됩니다. 최대 6장' }), thumbs, err);
    const txt = textarea('chatText', { placeholder: '상대: 오늘 뭐 해요?\n나: 집이에요. 왜요?\n상대: …', 'aria-label': '대화 글' });
    const long = h('p', { class: 'fld-help fld-bad', hidden: v.chatText.length <= 20000 }, '대화가 길어 앞부분 2만 자까지만 분석해요. 돈 이야기가 나온 부분이 앞에 오도록 넣어 주세요.');
    txt.addEventListener('input', () => { long.hidden = v.chatText.length <= 20000; });
    const txtPane = h('div', {}, txt, h('p', { class: 'fld-help' }, '말한 사람을 “상대:”와 “나:”로 적으면 상대가 한 말만 골라 분석합니다.'), long);
    const seg = h('div', { class: 'seg', role: 'tablist' },
      ['image', 'text'].map((m) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(v.chatMode === m), onclick: () => { v.chatMode = m; renderStep(0); } }, m === 'image' ? '캡처 올리기' : '글로 붙여넣기')));
    paint();
    return {
      body: [...head('대화를 올려 주세요', '캡처를 올리면 AI가 글자를 읽습니다. 대화를 글로 붙여 넣어도 됩니다.'), seg, v.chatMode === 'image' ? imgPane : txtPane],
      skip: true,
      onPaste: v.chatMode === 'image' ? (e) => { const f = pastedImages(e); if (f.length) { e.preventDefault(); add(f); } } : null,
      next: { label: '다음', ok: () => (v.chatMode === 'image' ? v.chatImages.length > 0 : v.chatText.trim().length >= 5), why: () => (v.chatMode === 'text' && v.chatText.trim() ? '대화를 조금 더 넣어 주세요. 다섯 글자 이상이면 됩니다.' : ''), go: next },
    };
  },

  photo() {
    const v = W.v;
    const box = h('div', { class: 'thumbs' });
    const err = h('p', { class: 'err-msg' });
    const paint = () => box.replaceChildren(...(v.photo ? [h('div', { class: 'thumb photo-big' }, h('img', { src: v.photo, alt: '상대방 사진' }),
      h('button', { type: 'button', 'aria-label': '빼기', onclick: () => { v.photo = ''; paint(); W.refresh(); } }, '×'))] : []));
    const add = async (files) => {
      err.textContent = '';
      if (!files[0]) return;
      try { v.photo = await compress(files[0], 1024); } catch (e) { err.textContent = e.message; }
      paint();
      W.refresh();
    };
    paint();
    return {
      body: [...head('상대방 사진을 올려 주세요', '프로필 사진 한 장이면 됩니다. 사진은 분석에만 쓰고 저장하지 않습니다.'),
        dropZone({ onFiles: add, title: '사진을 올려 주세요', sub: '여기에 끌어다 놓거나 눌러서 고릅니다. 붙여넣기도 됩니다.' }), box, err],
      skip: true,
      onPaste: (e) => { const f = pastedImages(e); if (f.length) { e.preventDefault(); add(f); } },
      next: { label: '다음', ok: () => Boolean(v.photo), go: next },
    };
  },

  account() {
    const bank = h('select', { class: 'inp', id: 'f-bank', 'aria-label': '은행', onchange: (e) => { W.v.bank = e.target.value; } },
      h('option', { value: '' }, '은행 선택'), BANKS.map((b) => h('option', { value: b, selected: W.v.bank === b }, b)));
    const num = input('account', { inputmode: 'numeric', placeholder: '계좌번호 숫자', 'aria-label': '계좌번호' }, (x) => x.replace(/[^\d-]/g, ''));
    return {
      body: [...head('계좌번호를 입력해 주세요', '돈을 보내 달라고 한 계좌를 넣어 주세요. 은행은 몰라도 됩니다.'),
        h('div', { class: 'fld' }, h('span', { class: 'lbl' }, '계좌'), h('div', { class: 'inp-row' }, bank, num))],
      skip: true,
      focus: num,
      next: { label: '다음', ok: () => digits(W.v.account).length >= 8, why: () => (digits(W.v.account).length ? '계좌번호가 짧아요. 숫자 8자리 이상 넣어 주세요.' : ''), go: next },
    };
  },

  url() {
    return {
      body: [...head('상대방이 보낸 링크를 넣어 주세요', '투자 사이트, 쇼핑몰, 받은 링크를 넣어 주세요. 여러 개면 줄을 바꿔 적습니다.'),
        field('링크', textarea('url', { class: 'inp sm', placeholder: 'https://', spellcheck: 'false' }), h('p', { class: 'fld-help' }, '사이트에 직접 접속하지 않고 공개된 등록 정보만 확인합니다.'))],
      skip: true,
      next: {
        label: '다음', ok: () => siteUrls(W.v.url).length > 0, go: next,
        why: () => (!W.v.url.trim() ? '' : W.v.url.split(/[\s,]+/).some(isSnsUrl) ? 'SNS·유튜브·블로그 주소는 확인하지 않아요. 투자·쇼핑 사이트처럼 상대가 보낸 사이트 주소를 넣어 주세요.' : '링크 모양이 아니에요. example.com처럼 점(.)이 들어간 주소를 넣어 주세요.'),
      },
    };
  },

  company() {
    const v = W.v;
    const medical = () => /의사|간호사|약사/.test(v.job);
    const work = field('근무하는 병원', input('workplace', { placeholder: '○○병원' }));
    work.hidden = !medical();
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': '직업' }, (CONFIG.jobs || []).map((j) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(v.job === j),
      onclick: (e) => {
        v.job = v.job === j ? '' : j;
        $$('.chip', chips).forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === v.job)));
        work.hidden = !medical();
        W.refresh();
      },
    }, j)));
    // '(주)○○'·'○○ 다녀요'처럼 적어도 회사 이름만 떼어 찾는다 (public/parse-input.js)
    const coHelp = h('p', { class: 'fld-help', 'aria-live': 'polite' });
    const co = input('company', { placeholder: '주식회사 ○○' });
    const paintCo = () => {
      const raw = v.company.trim();
      const n = companyName(raw);
      coHelp.textContent = raw && n && n !== raw ? `"${n}" 이름으로 찾습니다.` : '주식회사·(주)는 붙여도 되고 빼도 됩니다.';
    };
    co.addEventListener('input', paintCo);
    paintCo();
    return {
      body: [...head('회사와 직업을 알려 주세요', '상대가 다닌다고 한 회사나 직업을 넣어 주세요. 하나만 넣어도 됩니다.'),
        field('회사명', co, coHelp),
        h('div', { class: 'fld' }, h('span', { class: 'lbl' }, '직업'), chips), work],
      skip: true,
      next: { label: '다음', ok: () => Boolean(v.company.trim() || v.job), go: next },
    };
  },

  biz() {
    const help = h('p', { class: 'fld-help' });
    const el = input('biz', { inputmode: 'numeric', placeholder: '123-45-67890' }, fmtBiz);
    const paint = () => {
      const d = digits(W.v.biz);
      help.className = 'fld-help';
      if (d.length < 10) help.textContent = '숫자 10자리입니다.';
      else if (bizOk(d)) { help.textContent = '번호 계산 규칙에 맞는 번호입니다.'; help.classList.add('fld-ok'); }
      else { help.textContent = '번호 계산 규칙에 맞지 않습니다. 그대로 진행하면 리포트에 함께 표시됩니다.'; help.classList.add('fld-bad'); }
    };
    el.addEventListener('input', paint);
    paint();
    return {
      body: [...head('사업자등록번호를 입력해 주세요', '상대가 운영한다고 한 사업체의 번호입니다.'), field('사업자등록번호', el, help)],
      skip: true,
      next: { label: '다음', ok: () => digits(W.v.biz).length === 10, go: next },
    };
  },

  shop() {
    const shopUrl = input('shopUrl', { placeholder: '있으면 넣어 주세요', spellcheck: 'false' });
    const shopHelp = h('p', { class: 'fld-help fld-bad', hidden: !isSnsUrl(W.v.shopUrl) }, 'SNS·블로그 주소는 확인하지 않아요. 쇼핑몰 사이트 주소가 있으면 넣어 주세요.');
    shopUrl.addEventListener('input', () => { shopHelp.hidden = !isSnsUrl(W.v.shopUrl); });
    return {
      body: [...head('쇼핑몰이나 사업체 이름을 알려 주세요', '주소까지 알면 신고 여부와 사이트를 만든 날짜를 함께 확인합니다.'),
        field('상호', input('shop', { placeholder: '○○몰' })),
        field('쇼핑몰 주소', shopUrl, shopHelp)],
      skip: true,
      next: { label: '다음', ok: () => W.v.shop.trim().length >= 1, go: next },
    };
  },

  claims() {
    const ta = textarea('claims', { class: 'inp sm', placeholder: '예: 강남에 산다고 했어요. 회사를 8년째 운영 중이라고 했어요.' });
    const chips = h('div', { class: 'chips', style: 'margin-bottom:12px' }, CLAIM_HINTS.map((c) => h('button', {
      class: 'chip add', type: 'button',
      onclick: () => { W.v.claims = [W.v.claims.trim(), c].filter(Boolean).join('\n'); ta.value = W.v.claims; ta.focus(); W.refresh(); },
    }, `+ ${c}`)));
    return {
      body: [...head('상대가 자기에 대해 한 말을 적어 주세요', '사는 곳, 직업, 경력, 운영 기간처럼 확인하고 싶은 말을 적어 주세요. 대화와 맞는지 비교합니다.'), chips, ta,
        // 최소 수집 — 비교에 필요 없는 이름·연락처·계정은 적지 않게(2026-10-26)
        h('p', { class: 'fld-help' }, '이름, 연락처, SNS 아이디는 적지 않아도 됩니다. 비교에 쓰지 않습니다.')],
      skip: true,
      focus: ta,
      next: { label: '다음', ok: () => W.v.claims.trim().length >= 2, why: () => (W.v.claims.trim() ? '두 글자 이상 적어 주세요.' : ''), go: next },
    };
  },

  confirm() {
    const v = W.val();
    const mask = {
      phone: () => { const d = digits(v.phone); return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : v.phone; },
      chat: () => (v.chatImages.length ? `캡처 ${v.chatImages.length}장` : `글 ${v.chatText.length.toLocaleString('ko-KR')}자`),
      photo: () => '사진 1장',
      account: () => `${v.bank ? `${v.bank} ` : ''}****${v.account.slice(-4)}`,
      url: () => siteUrls(W.v.url).join(', '),
      company: () => [v.company, v.job, v.workplace].filter(Boolean).join(', '),
      biz: () => fmtBiz(v.biz),
      shop: () => [v.shop, isSnsUrl(W.v.shopUrl) ? '' : W.v.shopUrl].filter(Boolean).join(', '),
      claims: () => (v.claims.length > 30 ? `${v.claims.slice(0, 30)}…` : v.claims),
    };
    const rows = INPUTS.filter((x) => W.sel.has(x.key)).map((x) => h('div', { class: 'sum-row' },
      h('dt', {}, x.label), h('dd', {}, mask[x.key]?.() || ''),
      h('button', { type: 'button', class: 'link-btn', onclick: () => go(W.steps.indexOf(x.key), -1) }, '수정')));
    const ids = exactIds();
    const boxes = ['상대방에게 직접 받은 정보만 입력했습니다.', '분석이 끝나면 입력한 원본이 자동으로 삭제되는 것을 확인했습니다.'].map((t, k) => h('label', { class: 'consent' },
      h('input', { type: 'checkbox', checked: W.consent[k], onchange: (e) => { W.consent[k] = e.target.checked; } }), h('span', {}, t)));
    // 생성형 AI 사전 고지(AI기본법 제31조 제1항, 2026-01-22 시행) — 대화·사진을 고른 경우에만 AI 를 쓰므로 그때 보여 준다
    const usesAi = W.sel.has('chat') || W.sel.has('photo');
    return {
      body: [...head('이대로 무료 점검을 시작할까요?', '번호·링크·사업자 결과는 무료로 바로 보여 드리고, 대화에서 찾은 신호 수도 알려 드립니다.'),
        h('dl', { class: 'sum' }, rows),
        h('p', { class: 'pv-line' }, `총 13개 항목 중 ${ids.length}개 검사 가능`),
        usesAi ? h('p', { class: 'ai-note w' }, h('b', {}, '생성형 AI 사용 안내'), ' 대화와 사진은 생성형 AI인 구글 제미나이로 분석하고, 대화 캡처의 글자도 AI가 읽습니다. AI가 작성한 설명에는 리포트에서 ‘AI 생성’ 표시를 붙입니다.') : null,
        boxes],
      next: {
        label: '무료 점검 시작', rose: true, ok: () => W.consent.every(Boolean) && ids.length > 0, go: () => next(),
        why: () => (!ids.length ? '고른 정보로는 점검할 항목이 없어요. 이전으로 돌아가 정보를 하나 더 넣어 주세요.' : '아래 두 칸에 모두 체크하면 시작할 수 있어요.'),
      },
    };
  },

  run() {
    const ids = exactIds();
    const bar = h('div', { class: 'run-bar' }, h('i'));
    const list = h('ol', { class: 'run-list' }, ids.map((id) => {
      const c = CONFIG.checks.find((x) => x.id === id);
      return h('li', { 'data-id': id }, h('span', { class: 'no' }, pad2(c.no)), h('span', {}, c.title), h('span', { class: 'st' }));
    }));
    const err = h('p', { class: 'err-msg', role: 'alert' });
    return {
      body: [...head('받은 메시지와 정보를 살펴보고 있습니다', '대화를 분석하고 링크·사업자 같은 공개 정보를 확인합니다. 보통 10초 안팎 걸립니다.'), bar, list, err],
      back: false,
      after: () => runAnalysis(list, bar.firstChild, err),
    };
  },

  preview() {
    const p = W.preview;
    const items = p.items.filter((i) => i.checkable);
    const skipped = p.items.length - items.length;
    const fullItems = items.filter((i) => i.plan === 'full');
    const fullSignals = fullItems.reduce((s, i) => s + i.signalCount, 0);
    const freeSignals = items.filter((i) => i.plan !== 'full').reduce((s, i) => s + i.signalCount, 0);
    const chip = (i) => (i.status === 'signal' ? ['st-signal', `확인 신호 ${i.signalCount}건`] : i.status === 'note' ? ['st-note', `참고 ${i.noteCount}건`] : i.status === 'retry' ? ['st-pending', '다시 확인 필요'] : i.status === 'pending' ? ['st-pending', '연동 준비 중'] : ['st-clear', '특이사항 없음']);
    const nN = h('b', {}, '0');
    const nS = h('b', {}, '0');
    // 정밀 분석으로 볼 것이 없으면(대화·사진 없음) 무료 점검을 먼저 고른다
    if (!fullItems.length) W.plan = 'free';
    W.recheckToken = recentFullToken();
    const fullPrice = W.recheckToken ? CONFIG.addons?.recheck?.price : CONFIG.plans?.full?.price;
    const desc = {
      free: `번호·계좌 직접 조회 안내, 링크·사업자 결과${freeSignals ? `, 확인 신호 ${freeSignals}건` : ''}`,
      full: W.recheckToken
        ? '24시간 안에 정밀 분석을 받아 재검사 값이 적용됩니다. 대화 근거 문장, 사진 도용 검색, 대화 순서 정리'
        : `무료 결과 전부와 대화 근거 문장${fullSignals ? ` ${fullSignals}건` : ''}, 사진 도용 검색, 대화 순서 정리, 다음에 할 일`,
    };
    const plans = h('div', { class: 'plan-pick' }, ['free', 'full'].map((k) => h('button', {
      class: 'pp', type: 'button', 'aria-pressed': String(W.plan === k), disabled: k === 'full' && !fullItems.length,
      onclick: (e) => { W.plan = k; $$('.pp', plans).forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); },
    },
    k === 'full' && fullSignals ? h('span', { class: 'rec' }, '추천') : null,
    h('b', {}, k === 'full' && W.recheckToken ? '정밀 분석 · 재검사' : planLabel(k)),
    h('p', { class: 'pp-price' }, k === 'full' ? (fullPrice ? won(fullPrice) : '가격 미정') : '0원'),
    h('span', {}, k === 'full' && !fullItems.length ? '대화나 사진을 넣으면 고를 수 있습니다' : desc[k]))));
    const openErr = h('p', { class: 'err-msg', role: 'alert' });
    return {
      body: [...head('무료 점검 결과', null),
        h('p', { class: 'pv-line' }, h('span', { class: 'nw' }, `총 13개 항목 중 ${p.totals.checkable}개 점검`), ' / ', h('span', { class: 'nw' }, `확인 신호 ${p.totals.signals}개 발견`)),
        h('div', { class: 'pv-stat' },
          h('div', {}, h('p', {}, '점검한 항목'), nN, h('p', {}, '13개 중')),
          h('div', { class: 'sig' }, h('p', {}, '확인 신호'), nS, h('p', {}, p.totals.notes ? `참고 ${p.totals.notes}건 별도` : '건'))),
        p.notes?.length ? h('p', { class: 'notice', style: 'margin-bottom:16px' }, p.notes.join(' ')) : null,
        h('div', { class: 'pv-list' }, items.map((i, k) => {
          const [cls, txt] = chip(i);
          return h('div', { class: 'pv-row', style: `animation-delay:${k * 0.05}s` },
            h('span', { class: 'no' }, pad2(i.no)),
            h('span', {}, i.title, h('span', { class: 'lock' }, i.plan === 'full' ? ' · 정밀 분석' : ' · 무료')),
            h('span', { class: `chip-st ${cls}` }, txt));
        })),
        skipped ? h('p', { class: 'pv-more' }, `정보가 없어 점검하지 않은 항목 ${skipped}개`) : null,
        h('p', { class: 'lbl', style: 'font-weight:800;margin-bottom:10px' }, '리포트 고르기'),
        plans, openErr],
      back: false,
      after: () => { countUp(nN, p.totals.checkable, 900); countUp(nS, p.totals.signals, 1100); track('preview_view'); },
      next: {
        label: '리포트 열기', rose: true, ok: () => true,
        go: async () => {
          track('plan_view');
          if (W.plan !== 'free') { next(); return; }
          const btn = $('#wz-next');
          btn.disabled = true;
          openErr.textContent = '';
          try {
            await payAndOpen({ token: W.token, plan: 'free', visitor });
          } catch (e) {
            openErr.textContent = e.message;
            btn.disabled = false;
          }
        },
      },
    };
  },

  pay() {
    const err = h('p', { class: 'err-msg', role: 'alert' });
    const recheck = Boolean(W.recheckToken);
    return {
      body: [...head('결제', '구독 없이 이번 점검 한 건만 결제합니다.'),
        h('div', { class: 'pay-box' }, h('dl', {},
          h('dt', {}, '상품'), h('dd', {}, recheck ? 'DATE CHECK 재검사(정밀 분석)' : 'DATE CHECK 정밀 분석'),
          h('dt', {}, '점검 항목'), h('dd', {}, `${W.preview.totals.checkable}개`),
          h('dt', {}, '리포트 보관'), h('dd', {}, '결제 후 24시간'),
          h('dt', {}, '금액'), h('dd', {}, priceText(recheck ? 'recheck' : 'full')))),
        h('p', { class: 'notice w' }, '시험판이라 결제 수단이 연결돼 있지 않습니다. 아래 버튼을 누르면 테스트 결제로 처리됩니다. 리포트를 연 뒤에는 디지털 콘텐츠 특성상 환불이 제한될 수 있습니다.'),
        err],
      backTo: 'preview',
      next: {
        label: '테스트 결제 완료', rose: true, ok: () => true,
        go: async () => {
          const btn = $('#wz-next');
          btn.disabled = true;
          err.textContent = '';
          try {
            await payAndOpen({ token: W.token, plan: 'full', visitor, recheckToken: W.recheckToken || undefined });
          } catch (e) {
            err.textContent = e.message;
            btn.disabled = false;
          }
        },
      },
    };
  },
};

// 결제(시험판)하고 리포트로 — 무료 점검도 같은 길로 연다
async function payAndOpen(body) {
  const j = await api('/api/pay', { body });
  keepReport(j);
  resetWizard();
  closeWizard();
  navigate(`/report/${j.id}`);
}

async function runAnalysis(list, bar, err) {
  const rows = $$('li', list);
  const t0 = performance.now();
  let k = 0;
  let done = false;
  const tick = setInterval(() => {
    if (done) return;
    if (k > 0) rows[k - 1]?.classList.replace('go', 'ok');
    if (k < rows.length - 1) { rows[k]?.classList.add('go'); k += 1; }
    else rows[k]?.classList.add('go');
    bar.style.width = `${Math.min(88, (k / rows.length) * 88)}%`;
  }, reduce ? 50 : 520);
  try {
    const body = JSON.stringify({ visitor, input: W.val() });
    // 서버 함수가 받는 요청 크기 한도(4.5MB) 안으로
    if (body.length > 4_200_000) throw new Error('올린 사진이 너무 큽니다. 캡처 수를 줄여 주세요.');
    // 서버 함수는 60초까지 돈다 — 그보다 조금 길게 기다린다
    const j = await api('/api/analyze', { body, timeout: 70000 });
    const wait = Math.max(0, 2600 - (performance.now() - t0));
    await sleep(wait);
    done = true;
    clearInterval(tick);
    for (const row of rows) {
      if (!row.classList.contains('ok')) {
        row.classList.remove('go');
        row.classList.add('ok');
        await sleep(90);
      }
    }
    bar.style.width = '100%';
    W.id = j.id;
    W.token = j.token;
    W.preview = j.preview;
    await sleep(450);
    go(W.steps.indexOf('preview'), 1);
  } catch (e) {
    done = true;
    clearInterval(tick);
    rows.forEach((r) => r.classList.remove('go'));
    err.textContent = e.message;
    const foot = $('#wz-foot');
    foot.hidden = false;
    foot.replaceChildren(
      h('button', { class: 'btn btn-line', type: 'button', onclick: () => go(W.steps.indexOf('confirm'), -1) }, '이전'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-rose', type: 'button', id: 'wz-retry', onclick: () => go(W.steps.indexOf('run'), 0) }, '다시 시도'));
  }
}

// =====================================================================
// 리포트 (STEP 7·8)
// =====================================================================
function navigate(path) {
  if (location.pathname + location.hash !== path) history.pushState({}, '', path);
  route();
}
addEventListener('popstate', route);

function route() {
  const m = location.pathname.match(/^\/report\/([A-Za-z0-9_-]{8,20})$/);
  const landing = $('#landing');
  const view = $('#report-view');
  if (m) {
    landing.hidden = true;
    view.hidden = false;
    $('#nav').classList.add('solid');
    showReport(m[1]);
  } else {
    landing.hidden = false;
    view.hidden = true;
    view.replaceChildren();
    $('#nav').classList.toggle('solid', scrollY > 40);
    window.__fillMarquee?.();
  }
}

const STATUS_CHIP = {
  signal: (i) => ['st-signal', `확인 신호 ${i.signalCount}건`],
  note: (i) => ['st-note', `참고 ${i.noteCount}건`],
  clear: () => ['st-clear', '특이사항 없음'],
  pending: () => ['st-pending', '연동 준비 중'],
  retry: () => ['st-pending', '다시 확인 필요'],
  na: () => ['st-na', '검사하지 않음'],
};

function quote(e) {
  return h('div', { class: 'quote' }, '“', e.before || '', h('mark', {}, e.match || ''), e.after || '', '”');
}
function srcList(list) {
  return h('ul', { class: 'srcs' }, list.map((s) => h('li', {}, ext(s.url, s.title || s.url), h('span', {}, [s.where, s.date].filter(Boolean).join(' · ')))));
}
// ---------- 직접 조회 안내: 경찰민원24·더치트는 자동 조회가 안 돼서, 어디에 검색하는지 화면 캡처로 보여 준다 ----------
const KIND_WORD = { phone: '전화번호', account: '계좌번호' };
const HOWTO = {
  police: {
    name: '경찰민원24',
    btn: '경찰민원24 사기 이력조회',
    sub: '공식 · 최근 3개월 신고와 비교',
    title: '경찰민원24에서 사기 신고 이력 조회하기',
    img: (k) => (k === 'account' ? '/img/howto/police-account.webp' : '/img/howto/police-phone.webp'),
    size: [1920, 1326],
    dpr: 1.5,
    focus: [0.289, 0.817],
    imgM: (k) => (k === 'account' ? '/img/howto/police-account-m.webp' : '/img/howto/police-phone-m.webp'),
    sizeM: [780, 2324],
    dprM: 2,
    focusM: [0.5, 0.789],
    steps: (k) => (KIND_WORD[k]
      ? [`${KIND_WORD[k]}를 복사합니다.`, "경찰민원24 첫 화면에서 '사이버사기 피해신고 이력조회' 칸을 찾습니다. 폰에서는 조금 아래로 내리면 있습니다.", `빨간 상자에서 '${KIND_WORD[k]}'를 고르고, 번호를 붙여 넣은 뒤 조회를 누릅니다.`]
      : ["경찰민원24 첫 화면에서 '사이버사기 피해신고 이력조회' 칸을 찾습니다. 폰에서는 조금 아래로 내리면 있습니다.", '빨간 상자에서 전화번호, 계좌번호, 이메일 중 하나를 고르고, 번호를 넣은 뒤 조회를 누릅니다.']),
    note: '최근 3개월 동안 3회 이상 신고된 번호와 비교합니다. 나오지 않아도 안전하다는 뜻은 아닙니다.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 4 5.6v6.1c0 4.9 3.4 8.6 8 9.8 4.6-1.2 8-4.9 8-9.8V5.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m8.6 12 2.4 2.4 4.4-4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  thecheat: {
    name: '더치트',
    btn: '더치트 피해사례 검색',
    sub: '민간 · 피해자가 등록한 사례',
    title: '더치트에서 피해 사례 검색하기',
    img: () => '/img/howto/thecheat.webp',
    size: [1920, 764],
    dpr: 1.5,
    focus: [0.5, 0.773],
    imgM: () => '/img/howto/thecheat-m.webp',
    sizeM: [1503, 833],
    dprM: 1.5,
    focusM: [0.638, 0.709],
    steps: (k) => [`${KIND_WORD[k] || '번호'}를 복사합니다.`, "더치트 검색 화면 가운데의 '사기피해사례 검색' 칸(빨간 상자)에 붙여 넣고 검색을 누릅니다."],
    note: '더치트는 피해자가 직접 등록한 사례를 모은 민간 서비스입니다.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
};
// 예전에 만든 리포트(guide 표시 없음)도 주소로 알아본다
const guideOf = (l) => l.guide || (/minwon24\.police\.go\.kr/.test(l.url) ? 'police' : /thecheat\.co\.kr/.test(l.url) ? 'thecheat' : null);
const svgIcon = (markup) => { const s = h('span', { class: 'lk-ic' }); s.innerHTML = markup; return s; };

// ---------- 복사 칸: 값 + 복사 버튼, 누르면 '복사됨'으로 잠깐 바뀐다 ----------
const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 권한이 없거나 http — 예전 방식으로 */ }
  const ta = h('textarea', { readonly: true, style: 'position:fixed;top:-100px;opacity:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

function copyField(value, { label, big } = {}) {
  const val = h('span', { class: 'cpy-v', title: value }, value);
  const ic = h('span', { class: 'cpy-ic' });
  ic.innerHTML = ICON_COPY;
  const txt = h('span', { class: 'cpy-t' }, '복사');
  const live = h('span', { class: 'sr', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'cpy-b', 'aria-label': `${label ? `${label} ` : ''}${value} 복사` }, ic, txt);
  const wrap = h('div', { class: `cpy${big ? ' cpy-lg' : ''}` }, h('span', { class: 'cpy-txt' }, label ? h('span', { class: 'cpy-l' }, label) : null, val), btn, live);
  let timer;
  btn.addEventListener('click', async () => {
    if (!(await writeClipboard(value))) {
      // 복사가 막힌 브라우저: 번호를 선택해 두고 직접 복사하게
      const r = document.createRange();
      r.selectNodeContents(val);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      toast('번호를 길게 눌러 복사해 주세요');
      return;
    }
    track('copy');
    wrap.classList.add('done');
    ic.innerHTML = ICON_CHECK;
    txt.textContent = '복사됨';
    live.textContent = `${value} 복사했습니다`;
    clearTimeout(timer);
    timer = setTimeout(() => { wrap.classList.remove('done'); ic.innerHTML = ICON_COPY; txt.textContent = '복사'; live.textContent = ''; }, 2000);
  });
  return wrap;
}

function openHowto(l, kind) {
  const g = HOWTO[guideOf(l)];
  track(`howto_${guideOf(l)}`);
  const copyBtn = l.copy ? h('div', { class: 'howto-copy' }, copyField(l.copy, { label: KIND_WORD[kind] || '번호', big: true })) : null;
  sheet(
    h('span', { class: 'howto-k' }, '직접 조회'),
    h('h2', {}, g.title),
    h('ol', { class: 'howto-steps' }, g.steps(kind).map((s) => h('li', {}, h('span', { class: 'w' }, s)))),
    copyBtn,
    h('figure', { class: 'howto-shot' },
      // 폰에서는 경찰민원24 모바일 화면, 더치트는 폰 폭에 맞춰 자른 화면. 누르면 이 화면 위에 크게(새 페이지 없이)
      h('button', { type: 'button', class: 'howto-zoom', 'aria-label': `${g.name} 화면 크게 보기`, onclick: (e) => openZoom(e.currentTarget.querySelector('img'), g) },
        h('picture', {},
          h('source', { media: '(max-width: 600px)', srcset: g.imgM(kind), width: g.sizeM[0], height: g.sizeM[1] }),
          h('img', { src: g.img(kind), alt: `${g.name} 화면. 빨간 상자가 번호를 넣고 검색하는 곳입니다.`, width: g.size[0], height: g.size[1] })),
        h('span', { class: 'howto-zoom-b', 'aria-hidden': 'true' }, '크게 보기')),
      h('figcaption', { class: 'w' }, g.note)),
    h('a', {
      class: 'btn btn-navy howto-go', href: l.url, target: '_blank', rel: 'noopener noreferrer',
      onclick: () => { track(`howto_open_${guideOf(l)}`); if (l.copy) writeClipboard(l.copy); },
    }, l.copy ? `번호 복사하고 ${g.name} 열기` : `${g.name} 열기`, h('span', { 'aria-hidden': 'true' }, '↗')),
    h('p', { class: 'howto-url' }, new URL(l.url).host));
}

// 캡처 크게 보기 — 안내 팝업 위에 한 겹 더. 처음엔 빨간 상자 쪽으로 맞추고, 크면 밀어서 본다
function openZoom(img, g) {
  const mobile = matchMedia('(max-width: 600px)').matches;
  const [w, ht] = mobile ? g.sizeM : g.size;
  const natW = w / ((mobile ? g.dprM : g.dpr) || 1);
  const focus = (mobile ? g.focusM : g.focus) || [0.5, 0.5];
  const wide = w > ht;
  // PC 는 화면 폭에 맞추고(원래 크기까지), 폰은 세로 그림은 폭에 맞추고 가로 그림은 빨간 상자가 한 화면에 들어올 만큼 키워 옆으로 민다
  const dispW = mobile ? (wide ? Math.min(natW, innerWidth * 1.35) : innerWidth - 24) : Math.min(natW, innerWidth - 64);
  const big = h('img', { src: img?.currentSrc || img?.src, alt: img?.alt || '', width: w, height: ht, style: `width:${Math.round(dispW)}px` });
  const stage = h('div', { class: 'zm-stage' }, big);
  const scroller = h('div', { class: 'zm-scroll' }, stage);
  const closeBtn = h('button', { class: 'zm-x', type: 'button', 'aria-label': '크게 보기 닫기' }, '×');
  const box = h('div', { class: 'zm', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${g.name} 화면 크게 보기` },
    h('div', { class: 'zm-bar' }, h('b', {}, `${g.name} 화면`), h('span', { class: 'w' }, mobile && wide ? '옆으로 밀어서 보세요' : '빨간 상자가 번호 넣는 곳'), closeBtn),
    scroller);
  const prev = document.activeElement;
  const close = () => { box.remove(); prev?.focus?.(); };
  closeBtn.addEventListener('click', close);
  scroller.addEventListener('click', (e) => { if (e.target === scroller || e.target === stage) close(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(box);
  closeBtn.focus();
  const aim = () => {
    scroller.scrollLeft = focus[0] * big.clientWidth - scroller.clientWidth / 2;
    scroller.scrollTop = focus[1] * big.clientHeight - scroller.clientHeight / 2;
  };
  if (big.complete) requestAnimationFrame(aim); else big.addEventListener('load', aim, { once: true });
  track('howto_zoom');
}

function lookupPanel(guides, kind) {
  const copy = guides.find((l) => l.copy)?.copy;
  return h('div', { class: 'lookup' },
    h('div', { class: 'lookup-h' }, h('b', {}, '직접 조회해 보세요'), h('span', { class: 'w' }, '경찰과 더치트의 피해 이력은 자동으로 조회할 수 없습니다. 버튼을 누르면 어디에 검색하는지 화면으로 보여 드립니다.')),
    h('div', { class: 'lookup-btns' },
      guides.map((l) => {
        const key = guideOf(l);
        const g = HOWTO[key];
        return h('button', { type: 'button', class: `lk lk-${key}`, onclick: () => openHowto({ ...l, copy: l.copy || copy }, kind) },
          svgIcon(g.icon), h('span', { class: 'lk-t' }, h('b', {}, g.btn), h('small', {}, g.sub)), h('span', { class: 'lk-go', 'aria-hidden': 'true' }, '→'));
      }),
      copy ? copyField(copy, { label: KIND_WORD[kind] || '번호' }) : null));
}

function linkRow(links, itemId) {
  if (!links?.length) return null;
  const guides = links.filter((l) => HOWTO[guideOf(l)]);
  const rest = links.filter((l) => !HOWTO[guideOf(l)]);
  const kind = guides.find((l) => l.kind)?.kind || (itemId === 'account' ? 'account' : itemId === 'phone' ? 'phone' : null);
  return [
    guides.length ? lookupPanel(guides, kind) : null,
    rest.length ? h('div', { class: 'it-links' }, rest.map((l) => [
      // 네이버는 API 대신 이용자 브라우저에서 검색 결과를 연다(2026-10-22)
      l.naver ? h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', class: 'nv-btn', onclick: () => track('naver_click') }, h('span', { class: 'nv-n', 'aria-hidden': 'true' }, 'N'), l.short || l.label) : ext(l.url, l.short || l.label),
      l.copy ? copyField(l.copy, { label: '번호' }) : null,
    ])) : null,
  ];
}

// 'AI 생성' 표시 — 생성형 AI(제미나이)가 쓴 설명(by: 'ai')에 붙인다. AI기본법 제31조 제2항(결과물 표시), 2026-01-22 시행
const aiChip = (s) => (s?.by === 'ai' ? h('span', { class: 'chip-ai', title: '생성형 AI인 구글 제미나이가 작성한 설명입니다' }, 'AI 생성') : null);
const hasAiText = (items) => (items || []).some((i) => !i.locked && [...(i.signals || []), ...(i.facts || [])].some((s) => s.by === 'ai'));

function itemCard(it, id) {
  const [cls, txt] = (STATUS_CHIP[it.status] || STATUS_CHIP.clear)(it);
  const card = h('article', { class: `it ${it.status}${it.locked ? ' locked' : ''}` },
    h('div', { class: 'it-top' },
      h('span', { class: 'it-no' }, pad2(it.no)),
      h('h3', {}, glue(it.title)),
      h('span', { class: `chip-st ${cls}` }, txt)),
    h('div', { class: 'tags' }, (it.sources || []).filter((s) => !['더치트 API', '공개 웹 언급'].includes(s)).map((s) => h('span', {}, s)), ['phone', 'account'].includes(it.id) && (it.sources || []).includes('더치트 API') ? h('span', {}, '경찰민원24·더치트 직접 조회') : null, it.plan === 'full' ? h('span', {}, '정밀 분석') : null));
  if (it.locked) {
    card.append(h('div', { class: 'lock-cover' },
      h('p', { class: 'w' }, it.signalCount ? `이 항목에서 확인 신호 ${it.signalCount}건이 나왔습니다. 근거 문장은 정밀 분석에서 볼 수 있습니다.` : '이 항목의 근거와 상세 내용은 정밀 분석에서 볼 수 있습니다.'),
      h('button', { class: 'btn btn-rose btn-sm', type: 'button', onclick: () => upgrade(id) }, `정밀 분석 열기 · ${OFFER.full ? won(OFFER.full) : priceText('full')}`)));
    return card;
  }
  for (const s of it.signals || []) {
    card.append(h('div', { class: 'sg' },
      h('div', { class: 'sg-t' }, h('span', { class: `chip-st ${s.level === 'signal' ? 'st-signal' : 'st-note'}` }, s.level === 'signal' ? '확인 신호' : '참고'), aiChip(s), h('span', {}, glue(s.title))),
      h('p', { class: 'w' }, s.text),
      (s.evidence || []).map(quote),
      s.sources?.length ? srcList(s.sources) : null,
      linkRow(s.links, it.id)));
  }
  if (it.facts?.length) card.append(h('ul', { class: 'facts' }, it.facts.map((f) => h('li', {}, aiChip(f), h('span', { class: 'w' }, f.text), f.sources?.length ? srcList(f.sources) : null))));
  // 예전 리포트에 남은 '더치트 API 제휴 계약 뒤' 안내는 보이지 않게 한다(지금은 직접 조회 안내로 바뀜)
  const pend = (it.pending || []).filter((p) => p.label !== '더치트 API');
  if (pend.length) card.append(h('div', { class: 'pend' }, pend.map((p) => h('div', {}, h('b', {}, glue(p.label)), glue(p.text)))));
  for (const el of linkRow(it.links, it.id) || []) if (el) card.append(el);
  // 정밀 분석 — 신호가 있는 대화 항목에는 '다음에 할 일'
  if (NEXT_STEP[it.id] && (it.signals || []).length) card.append(h('div', { class: 'next-step' }, h('b', {}, '다음에 할 일'), h('ul', {}, NEXT_STEP[it.id].map((t) => h('li', { class: 'w' }, t)))));
  return card;
}

const NEXT_STEP = {
  money: ['돈을 보내기 전에 짧게라도 영상통화로 얼굴을 확인하자고 해 보세요.', '받는 계좌의 이름이 상대가 말한 이름과 같은지 확인하세요. 다른 사람 이름이면 보내지 마세요.', '수수료·세금·보증금을 먼저 내라는 요구는 거절하세요.'],
  invest: ['권한 투자 사이트나 거래소가 금융위원회 신고 업체인지 먼저 확인하세요.', '수익을 보장한다는 말은 정상 투자에서 하지 않는 말입니다. 돈을 넣기 전에 멈추세요.', '대화를 다른 메신저로 옮기자고 하면 지금 대화를 캡처해 두세요.'],
  privacy: ['인증번호·비밀번호·신분증 사진은 누구에게도 보내지 마세요.', '설치하라는 앱이 있다면 설치하지 말고, 이미 설치했다면 삭제한 뒤 은행에 알리세요.'],
  avoid: ['만나기 전에 짧은 영상통화를 먼저 제안해 보세요.', '계속 미룬다면 돈 이야기가 나와도 응하지 마세요.'],
  mismatch: ['맞지 않는 부분을 직접 물어보고 답을 캡처해 두세요.', '회사나 사는 곳은 공개 정보로 다시 확인할 수 있습니다.'],
  photo: ['같은 사진이 나온 페이지의 인물과 상대가 같은 사람인지 영상통화로 확인하세요.'],
};

// ---------- 리포트 보관: 서버가 아니라 이 기기에, 암호화된 봉투로 24시간 ----------
const RKEY = 'dc-r-';
const reportCache = new Map();
const unsaved = new Set();
function keepReport(j) {
  try {
    localStorage.setItem(RKEY + j.id, JSON.stringify({ token: j.reportToken, exp: j.expiresAt, plan: j.report?.plan || null, paidAt: j.report?.paidAt || null }));
    unsaved.delete(j.id);
  } catch {
    unsaved.add(j.id); // 저장 못 해도 이번 화면에서는 연다 — 리포트 위에 안내
  }
  if (j.report) reportCache.set(j.id, j.report);
}
const forgetReport = (id) => { try { localStorage.removeItem(RKEY + id); } catch { /* 없음 */ } };
// 재검사 값 — 이 기기에서 24시간 안에 정밀 분석을 결제한 리포트가 있으면 그 봉투를 함께 보낸다(서버가 다시 확인)
function recentFullToken() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k?.startsWith(RKEY)) continue;
      const v = storedReport(k.slice(RKEY.length));
      if (v?.plan === 'full' && v.paidAt && Date.now() - v.paidAt < 86400000) return v.token;
    }
  } catch { /* 없음 */ }
  return null;
}
function storedReport(id) {
  try {
    const s = JSON.parse(localStorage.getItem(RKEY + id) || 'null');
    if (s && s.exp > Date.now()) return s;
    localStorage.removeItem(RKEY + id);
  } catch { /* 없음 */ }
  return null;
}
function purgeReports() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(RKEY)) storedReport(k.slice(RKEY.length));
    }
  } catch { /* 없음 */ }
}

// 무료 점검 → 정밀 분석, 신고용 정리본 추가 (시험판 결제)
async function upgrade(id, addon) {
  const s = storedReport(id);
  if (!s) {
    toast(unsaved.has(id) ? '이 브라우저는 리포트를 저장하지 못해 추가할 수 없어요. 새로 점검해 주세요.' : '이 기기에 리포트가 없거나 보관 시간(24시간)이 지났어요. 새로 점검해 주세요.');
    return;
  }
  const body = addon ? { token: s.token, addon } : { token: s.token, plan: 'full', visitor, recheckToken: recentFullToken() || undefined };
  let j;
  try {
    j = await api('/api/pay', { body });
  } catch (e) {
    toast(e.message);
    return;
  }
  keepReport(j);
  toast(addon ? '신고용 정리본을 만들었습니다' : '정밀 분석으로 열었습니다');
  await showReport(id);
  if (addon === 'casefile') openCasefile(j.report);
}

// ---------- 리포트 덧붙이는 칸: 대화 순서 정리 · 신고용 정리본 · 재검사 (2026-10-22) ----------
let OFFER = {};
const ymdText = (d) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;

function timelineSec(j) {
  const tl = j.timeline;
  if (!tl) return null;
  if (tl.locked) {
    if (!tl.count) return null;
    return h('section', { class: 'rp-sec' }, h('div', { class: 'tl-lock' },
      h('h2', { class: 'rp-sec-t' }, '대화 순서 정리'),
      h('p', { class: 'w' }, `상대가 한 말 가운데 확인할 말 ${tl.count}줄을 대화 순서대로 정리했습니다. 처음 돈 이야기가 나온 곳도 짚어 드립니다.`),
      h('button', { class: 'btn btn-rose btn-sm', type: 'button', onclick: () => upgrade(j.id) }, `정밀 분석 열기 · ${OFFER.full ? won(OFFER.full) : priceText('full')}`)));
  }
  return h('section', { class: 'rp-sec' },
    h('h2', { class: 'rp-sec-t' }, '대화 순서 정리', h('small', {}, tl.rows.length ? `전체 ${tl.total}줄 중 ${tl.rows.length}줄` : `전체 ${tl.total}줄`)),
    h('p', { class: 'w sec-desc' }, tl.rows.length ? '상대가 한 말 가운데 확인 신호나 금액이 나온 말만 순서대로 모았습니다.' : '상대가 한 말에서 돈 이야기나 확인 신호가 나온 말은 없었습니다.'),
    tl.rows.length ? h('ol', { class: 'tl' }, tl.rows.map((r) => h('li', { class: r.firstMoney ? 'first' : '' },
      h('span', { class: 'tl-n' }, `${r.n}번째 말`),
      h('div', { class: 'tl-b' },
        r.firstMoney ? h('em', { class: 'tl-first' }, '처음 돈 이야기') : null,
        h('p', { class: 'tl-q' }, r.text),
        r.amount || r.tags.length ? h('div', { class: 'tl-tags' }, r.amount ? h('span', { class: 'amt' }, r.amount) : null, r.tags.map((t) => h('span', {}, t))) : null)))) : null);
}

function casefileSec(j) {
  if (j.casefile) {
    return h('section', { class: 'rp-sec' }, h('div', { class: 'cf-card on' },
      h('div', {}, h('b', {}, '신고용 정리본'), h('p', { class: 'w' }, '상대 정보, 확인 신호, 대화 순서, 챙길 자료와 신고처를 한 장으로 정리했습니다.')),
      h('button', { class: 'btn btn-navy', type: 'button', onclick: () => openCasefile(j) }, '정리본 보기·인쇄')));
  }
  if (!OFFER.casefile) return null;
  return h('section', { class: 'rp-sec' }, h('div', { class: 'cf-card' },
    h('div', {}, h('b', {}, '신고용 정리본'), h('p', { class: 'w' }, '돈을 보냈거나 신고를 생각하고 있다면, 경찰 신고에 붙일 상대 정보·확인 신호·대화 순서·챙길 자료를 한 장으로 만들어 드립니다.')),
    h('button', { class: 'btn btn-rose', type: 'button', onclick: () => upgrade(j.id, 'casefile') }, `정리본 만들기 · ${won(OFFER.casefile)}`)));
}

function recheckSec(j) {
  if (!OFFER.recheck) return null;
  return h('section', { class: 'rp-sec' }, h('div', { class: 'cf-card re' },
    h('div', {}, h('b', {}, '새 대화가 왔나요?'), h('p', { class: 'w' }, `이 리포트를 받은 뒤 24시간 안에는 새 대화나 다른 상대를 ${won(OFFER.recheck)}에 정밀 분석합니다.`)),
    h('button', { class: 'btn btn-line', type: 'button', onclick: () => { navigate('/'); openWizard(); } }, '재검사 시작')));
}

// 신고용 정리본 — 화면 위 문서로 열고, 인쇄하면 이 문서만 나온다
function openCasefile(j) {
  const cf = j?.casefile;
  if (!cf) return;
  const sub = cf.subject || {};
  const info = [['전화번호', sub.phone], ['계좌', sub.account], ['사이트 주소', sub.url], ['회사·상호', sub.company], ['사업자등록번호', sub.biz], ['직업·근무처', sub.job], ['상대가 한 말', sub.claims]].filter(([, v]) => v);
  const sigItems = (j.items || []).filter((i) => i.checkable && !i.locked && (i.signals || []).length);
  const rows = j.timeline && !j.timeline.locked ? j.timeline.rows : [];
  const quoteText = (e) => `${e.before || ''}${e.match || ''}${e.after || ''}`;
  const doc = h('article', { class: 'cf-doc' },
    h('header', { class: 'cf-h' },
      h('p', { class: 'cf-eyebrow' }, 'DATE CHECK'),
      h('h1', {}, '사이버사기 신고용 정리본'),
      h('p', {}, `작성 ${ymdText(new Date())} · 점검 ${ymdText(new Date(j.createdAt))}`)),
    h('p', { class: 'cf-disc w' }, `받은 메시지와 정보를 DATE CHECK가 분석한 결과를 정리한 참고 자료입니다. 사기 여부는 수사기관이 판단합니다.${hasAiText(sigItems) ? ' ‘AI 생성’ 표시는 생성형 AI가 작성한 내용입니다.' : ''}`),
    h('h2', {}, '1. 상대방 정보'),
    info.length ? h('dl', { class: 'cf-dl' }, info.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : h('p', { class: 'cf-empty' }, '입력한 상대방 정보가 없습니다.'),
    h('h2', {}, '2. 대화에서 확인된 내용'),
    rows.length ? h('ol', { class: 'cf-tl' }, rows.map((r) => h('li', {}, h('b', {}, `${r.n}번째 말${r.firstMoney ? ' · 처음 돈 이야기' : ''}`), h('span', {}, `“${r.text}”`), r.tags.length || r.amount ? h('small', {}, [r.amount, ...r.tags].filter(Boolean).join(' · ')) : null)))
      : h('p', { class: 'cf-empty' }, j.plan === 'full' ? '돈 이야기나 확인 신호가 나온 말은 없었습니다.' : '대화 순서 정리는 정밀 분석에 들어 있습니다.'),
    h('h2', {}, '3. 확인 신호 요약'),
    sigItems.length ? h('ul', { class: 'cf-sig' }, sigItems.flatMap((i) => i.signals.map((s) => h('li', {},
      h('b', {}, `${i.title} · ${s.title}${s.by === 'ai' ? ' · AI 생성' : ''}`),
      (s.evidence || []).slice(0, 2).map((e) => h('q', {}, quoteText(e))))))) : h('p', { class: 'cf-empty' }, '확인 신호가 없었습니다.'),
    h('h2', {}, '4. 송금 기록'),
    h('p', { class: 'cf-hint' }, '보낸 돈이 있다면 직접 적어 주세요.'),
    h('table', { class: 'cf-tb' }, h('thead', {}, h('tr', {}, ['날짜', '금액', '받는 계좌·은행', '보낸 방법'].map((t) => h('th', {}, t)))),
      h('tbody', {}, [0, 1, 2, 3].map(() => h('tr', {}, [0, 1, 2, 3].map(() => h('td', {})))))),
    h('h2', {}, '5. 함께 낼 자료'),
    h('ul', { class: 'cf-check' }, ['대화 캡처 원본 (지우지 말고 그대로)', '상대 프로필 화면 캡처', '송금 내역·이체 확인증', '받은 링크와 사이트 화면 캡처', '이 정리본'].map((t) => h('li', {}, t))),
    h('h2', {}, '6. 신고·상담처'),
    h('ul', { class: 'cf-to' }, (j.reportTo || []).map((x) => h('li', {}, h('b', {}, x.name), h('span', {}, x.text), x.url ? h('small', {}, x.url) : null))));
  const close = () => { box.remove(); document.body.classList.remove('cf-open'); prev?.focus?.(); };
  const prev = document.activeElement;
  const box = h('div', { class: 'cf', role: 'dialog', 'aria-modal': 'true', 'aria-label': '신고용 정리본' },
    h('div', { class: 'cf-bar' }, h('b', {}, '신고용 정리본'),
      h('button', { class: 'btn btn-rose btn-sm', type: 'button', onclick: () => { track('casefile_print'); window.print(); } }, '인쇄·PDF 저장'),
      h('button', { class: 'zm-x', type: 'button', 'aria-label': '닫기', onclick: () => close() }, '×')),
    h('div', { class: 'cf-scroll' }, doc));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(box);
  document.body.classList.add('cf-open');
  glueText(box);
  wrapText(box);
  $('.zm-x', box).focus();
}

let countdownTimer = null;
async function showReport(id) {
  const view = $('#report-view');
  view.replaceChildren(h('div', { class: 'rp-empty' }, h('div', { class: 'wrap' }, h('p', {}, '리포트를 여는 중입니다'))));
  scrollTo({ top: 0 });
  let j = reportCache.get(id);
  let error = null;
  let canRetry = false;
  if (!j) {
    const s = storedReport(id);
    if (!s) {
      error = '리포트는 서버에 저장하지 않고 점검한 기기에만 24시간 보관합니다. 다른 기기이거나 보관 시간이 지났다면 새로 점검해 주세요.';
    } else {
      try {
        j = await api('/api/report', { body: { token: s.token } });
        reportCache.set(id, j);
      } catch (e) {
        j = null;
        error = e.message;
        if (e.status === 404 || e.status === 410) forgetReport(id);
        else canRetry = true;
      }
    }
  }
  if (!j) {
    view.replaceChildren(h('div', { class: 'rp-empty' }, h('div', { class: 'wrap' },
      h('h1', {}, '리포트를 열 수 없습니다'),
      h('p', { class: 'w' }, error),
      canRetry ? h('button', { class: 'btn btn-navy', type: 'button', style: 'margin-right:8px', onclick: () => showReport(id) }, '다시 시도') : null,
      h('button', { class: 'btn btn-rose', type: 'button', onclick: () => { navigate('/'); openWizard(); } }, '새로 점검하기'))));
    glueText(view);
    wrapText(view);
    return;
  }

  OFFER = j.offers || {};
  const t = j.totals;
  const items = j.items;
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'retry').length;
  const retrying = items.some((i) => i.status === 'retry');
  const nS = h('b', {}, '0');
  const nN = h('b', {}, '0');
  const nNote = h('b', {}, '0');
  const nP = h('b', {}, '0');
  const left = h('span', {});
  const paintLeft = () => {
    const ms = j.expiresAt - Date.now();
    if (ms <= 0) { left.textContent = '보관 시간이 지났습니다'; return; }
    left.textContent = `자동 삭제까지 ${Math.floor(ms / 3600000)}시간 ${Math.floor((ms % 3600000) / 60000)}분`;
  };
  paintLeft();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(paintLeft, 30000);

  const group = (status) => items.filter((i) => i.checkable && i.status === status);
  const sec = (title, list, desc) => (list.length ? h('section', { class: 'rp-sec' },
    h('h2', { class: 'rp-sec-t' }, title, h('small', {}, `${list.length}개 항목`)),
    desc ? h('p', { class: 'w', style: 'color:var(--sub);margin:-6px 0 14px;font-size:15.5px' }, desc) : null,
    list.map((i) => itemCard(i, j.id))) : null);
  const na = items.filter((i) => !i.checkable);
  const when = new Date(j.createdAt);

  view.replaceChildren(
    h('div', { class: 'rp-head' }, h('div', { class: 'wrap' },
      h('p', { class: 'rp-eyebrow' }, 'DATE CHECK REPORT'),
      h('h1', { class: 'rp-title' }, t.signals ? ['확인 신호 ', h('b', {}, String(t.signals)), '건'] : '확인 신호를 찾지 못했습니다'),
      h('div', { class: 'rp-meta' },
        h('span', {}, `${when.getFullYear()}.${pad2(when.getMonth() + 1)}.${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())} 점검`),
        h('span', {}, planLabel(j.plan)),
        left),
      h('div', { class: 'rp-stats' },
        h('div', {}, nN, h('span', {}, '검사한 항목, 13개 중')),
        h('div', { class: 'sig' }, nS, h('span', {}, '확인 신호')),
        h('div', {}, nNote, h('span', {}, '참고')),
        h('div', {}, nP, h('span', {}, retrying ? '다시 확인할 항목' : '연동 준비 중 항목'))))),
    h('div', { class: 'rp-body' }, h('div', { class: 'wrap' },
      h('div', { class: 'rp-disc' }, h('p', { class: 'w' }, h('b', {}, '분석 결과는 상대방의 신원·안전성을 보증하지 않습니다.'), ' 제공된 정보 범위에서 사실관계와 확인이 필요한 신호를 보여 드립니다. 신호가 있다면 돈을 보내기 전에 한 번 더 확인하세요.')),
      // .w 안의 span 은 wrap.js 가 다시 짜면서 표시 모양이 벗겨진다 → 따옴표 글자로
      hasAiText(items) ? h('p', { class: 'rp-ai w' }, '‘AI 생성’ 표시가 붙은 설명은 생성형 AI인 구글 제미나이가 작성했습니다. 근거 문장은 입력한 대화에 실제로 있는 문장만 보여 드리며, 캡처의 글자는 AI가 읽은 것이라 원본 캡처와 함께 확인하세요.') : null,
      unsaved.has(id) ? h('p', { class: 'rp-notes w' }, '이 브라우저에서는 리포트를 저장하지 못했어요(시크릿 모드나 저장 차단 설정일 수 있어요). 이 화면을 닫으면 다시 열 수 없으니, 필요한 내용은 아래 ‘PDF로 저장’으로 지금 남겨 두세요.') : null,
      j.meta?.notes?.length ? h('p', { class: 'rp-notes' }, j.meta.notes.join(' ')) : null,
      timelineSec(j),
      sec('확인 신호가 있는 항목', group('signal'), '사기에서 자주 보이는 흔적입니다. 근거를 직접 읽어 보세요.'),
      sec('참고할 항목', group('note'), '이것만으로 판단할 수는 없지만 알아 두면 좋은 내용입니다.'),
      sec('특이사항 없는 항목', group('clear'), '찾지 못했다는 뜻이며, 안전하다는 뜻은 아닙니다.'),
      sec('잠시 확인하지 못한 항목', group('retry'), '조회 서버가 잠깐 응답하지 않아 확인하지 못했습니다. 각 항목의 버튼으로 공식 사이트에서 바로 확인하거나, 잠시 뒤 새로 점검해 주세요. 무료 점검은 다시 해도 비용이 들지 않습니다.'),
      sec('연동 준비 중인 항목', group('pending'), '제휴나 공공데이터 키 연동 뒤 자동으로 조회합니다. 지금은 공식 사이트에서 직접 확인할 수 있습니다.'),
      na.length ? h('section', { class: 'rp-sec' }, h('h2', { class: 'rp-sec-t' }, '검사하지 않은 항목', h('small', {}, `${na.length}개`)),
        h('div', { class: 'na-list' }, na.map((i) => h('span', {}, `${pad2(i.no)} ${i.title}`)))) : null,
      h('section', { class: 'rp-sec' }, h('h2', { class: 'rp-sec-t' }, '공식 조회'),
        h('div', { class: 'off' }, (j.official || []).map((o) => (HOWTO[guideOf(o)]
          ? h('a', { href: o.url, class: 'off-guide', onclick: (e) => { e.preventDefault(); track('official_click'); openHowto(o, null); } }, h('b', {}, o.label), h('span', { class: 'w' }, o.text), h('em', {}, '어디에 검색하는지 보기'))
          : h('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => track('official_click') }, h('b', {}, o.label), h('span', { class: 'w' }, o.text)))))),
      h('section', { class: 'rp-sec' }, h('div', { class: 'sent-box' }, h('h3', {}, '이미 돈을 보냈다면'), h('ol', {}, (j.ifSent || []).map((x) => h('li', {}, x))))),
      casefileSec(j),
      recheckSec(j),
      h('div', { class: 'rp-actions' },
        h('button', { class: 'btn btn-navy', type: 'button', onclick: () => window.print() }, 'PDF로 저장'),
        h('button', { class: 'btn btn-line', type: 'button', onclick: () => { navigate('/'); openWizard(); } }, '새 점검 시작')))),
  );
  glueText(view);
  wrapText(view);
  countUp(nS, t.signals);
  countUp(nN, t.checkable);
  countUp(nNote, t.notes);
  countUp(nP, pending);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.2 });
  $$('.it', view).forEach((el) => io.observe(el));
}

// =====================================================================
// 작은 창: 삭제 요청·문의·신고 / 개인정보 처리 안내
// =====================================================================
function sheet(...content) {
  const s = $('#sheet');
  const close = () => { s.hidden = true; s.replaceChildren(); document.body.classList.remove('lock'); };
  s.replaceChildren(h('div', { class: 'sheet-bg', onclick: close }),
    h('div', { class: 'sheet-card', role: 'dialog', 'aria-modal': 'true' }, h('button', { class: 'wz-x sheet-x', type: 'button', 'aria-label': '닫기', onclick: close }, '×'), ...content));
  s.hidden = false;
  s.onkeydown = (e) => { if (e.key === 'Escape') close(); };
  document.body.classList.add('lock');
  wrapText(s);
  setTimeout(() => $('textarea, input, button.wz-x', s)?.focus(), 60);
  return close;
}

function openRequest() {
  let type = 'delete';
  const seg = h('div', { class: 'seg' }, [['delete', '삭제 요청'], ['inquiry', '문의'], ['report', '신고']].map(([k, l]) => h('button', {
    type: 'button', 'aria-selected': String(type === k), onclick: (e) => { type = k; $$('button', seg).forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); },
  }, l)));
  const msg = h('textarea', { class: 'inp sm', id: 'rq-msg', placeholder: '내용을 적어 주세요. 리포트 주소가 있으면 함께 적어 주세요.' });
  const contact = h('input', { class: 'inp', id: 'rq-contact', placeholder: '답변 받을 연락처 (선택)' });
  const err = h('p', { class: 'err-msg' });
  const close = sheet(h('h2', {}, '삭제 요청·문의·신고'), h('p', { class: 'w' }, '삭제 요청은 확인 뒤 바로 처리합니다.'), seg,
    h('div', { class: 'fld' }, msg), h('div', { class: 'fld' }, contact), err,
    h('button', {
      class: 'btn btn-rose', type: 'button', style: 'width:100%',
      onclick: async (e) => {
        const btn = e.currentTarget;
        err.textContent = '';
        if (!msg.value.trim()) { err.textContent = '내용을 적어 주세요. 삭제 요청이라면 리포트 주소나 점검한 날짜를 함께 적어 주세요.'; msg.focus(); return; }
        btn.disabled = true;
        try {
          await api('/api/request', { body: { type, message: msg.value, contact: contact.value } });
        } catch (x) {
          err.textContent = x.message;
          btn.disabled = false;
          return;
        }
        close();
        toast('접수했습니다');
      },
    }, '보내기'));
}

function openPrivacy() {
  sheet(h('h2', {}, '개인정보 처리 안내'),
    ...[
      '입력한 전화번호, 계좌번호, 사진, 대화 원본은 분석이 끝나면 저장하지 않고 파기합니다.',
      '리포트는 서버에 저장하지 않습니다. 서버만 풀 수 있게 암호화해 점검한 기기에만 24시간 보관하고 자동으로 지웁니다.',
      'AI 분석을 위해 대화와 사진을 구글 제미나이 API로 보냅니다. 사진 도용 확인을 위해 사진을 구글 Cloud Vision 웹 검색으로 보냅니다. 정식 출시 때 처리방침에 위탁과 국외 이전으로 안내합니다.',
      '대화·사진 분석에는 생성형 AI를 씁니다. AI가 작성한 설명에는 리포트에서 ‘AI 생성’ 표시를 붙입니다.',
      '분석 서버는 서울 지역에서 돌아갑니다. 이름과 SNS 계정은 사람을 찾는 데 쓰일 수 있어 입력받지 않습니다.',
      '사업자등록번호·회사 이름·병원 이름은 국세청·공정거래위원회·금융위원회·건강보험심사평가원의 공개 조회 서비스(공공데이터포털)로 확인합니다. 조회한 내용은 저장하지 않습니다.',
      '공개 글 검색은 저희가 대신 하지 않습니다. 네이버 버튼을 누르면 이용자 브라우저에서 네이버 검색 결과가 열립니다.',
      '성범죄자 공개정보와 범죄경력 정보는 저장하지 않습니다.',
      '관리자 화면에서도 원본 개인정보는 볼 수 없고, 관리자 접속은 기록으로 남습니다.',
    ].map((t) => h('p', { class: 'w' }, t)));
}

// =====================================================================
async function boot() {
  purgeReports();
  // 설정 없이도 첫 화면은 뜬다 — 못 받았으면 3초·10초 뒤 다시 받아 검사 항목 칸을 채운다
  if (!(await loadConfig())) {
    for (const wait of [3000, 10000]) {
      setTimeout(async () => { if (!CONFIG.checks.length && (await loadConfig())) { renderCheckGrid(); glueText(); wrapText(); } }, wait);
    }
  }
  initLanding();
  renderCheckGrid();
  route();
  glueText();
  wrapText();
  // 가이드 페이지의 '검증 시작' 단추로 들어오면 팝업을 바로 연다
  if (new URLSearchParams(location.search).get('start') === '1') {
    history.replaceState({}, '', '/');
    openWizard();
  }
}
boot();
