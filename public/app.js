// DATE CHECK 화면 — 첫 화면 연출, 팝업 단계 입력(STEP 1~6), 리포트(STEP 7~8)
// 바깥에서 온 글(검색 결과·대화)은 반드시 textContent 로만 넣는다.

const $ = (s, r = document) => r.querySelector(s);
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
    acceptNode: (n) => (n.parentElement?.closest('.w, script, style, textarea, input, .srcs, .quote') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    const g = glue(n.data);
    if (g !== n.data) n.data = g;
  }
}

// ---------- 방문자·이벤트 ----------
let visitor = localStorage.getItem('dc-visitor');
if (!visitor) {
  visitor = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('dc-visitor', visitor);
}
function track(type) {
  fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, visitor }), keepalive: true }).catch(() => {});
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
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
let CONFIG = { checks: [], plans: {}, jobs: [], official: [] };
const NEED = {
  phone: { need: '전화번호', g: 'contact' },
  account: { need: '계좌번호', g: 'contact' },
  money: { need: '카톡·DM 대화', g: 'chat' },
  invest: { need: '카톡·DM 대화', g: 'chat' },
  privacy: { need: '카톡·DM 대화', g: 'chat' },
  avoid: { need: '카톡·DM 대화', g: 'chat' },
  mismatch: { need: '대화와 상대가 한 말', g: 'chat' },
  photo: { need: '상대방 사진', g: 'photo' },
  link: { need: 'URL 또는 SNS 주소', g: 'link' },
  biz: { need: '사업자등록번호', g: 'biz' },
  commerce: { need: '사업자번호 또는 상호', g: 'biz' },
  company: { need: '회사명 또는 상호', g: 'biz' },
  job: { need: '직업', g: 'biz' },
};
const priceText = (plan) => {
  const p = CONFIG.plans?.[plan]?.price;
  return p ? `${p.toLocaleString('ko-KR')}원` : '가격 미정';
};
const planLabel = (plan) => CONFIG.plans?.[plan]?.label || (plan === 'full' ? 'Full Check' : 'Standard');
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
      h('span', { class: `ck-plan ${c.plan}` }, c.plan === 'full' ? 'Full Check' : 'Standard'),
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
  { key: 'sns', label: 'SNS 주소', desc: '인스타그램 같은 계정' },
  { key: 'company', label: '회사명·직업', desc: '다닌다고 한 회사와 직업' },
  { key: 'biz', label: '사업자등록번호', desc: '운영한다는 사업체 번호' },
  { key: 'shop', label: '쇼핑몰·사업체명', desc: '운영한다고 한 곳' },
  { key: 'claims', label: '상대가 직접 말한 정보', desc: '사는 곳, 경력, 운영 기간' },
  { key: 'name', label: '이름', desc: '교차검증 보조 정보' },
];
const STEP_LABEL = { select: '정보 선택', confirm: '입력 확인', run: '사전분석', preview: '분석 결과', pay: '결제' };
const BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국', '수협', '신협', 'SC제일', '부산', '경남', 'iM뱅크', '광주', '전북', '제주', '기타'];
const CLAIM_HINTS = ['서울에 산다고 했어요', '해외에서 일한다고 했어요', '회사를 5년째 운영 중이라고 했어요', '돈이 급하다고 했어요'];

const freshValues = () => ({ phone: '', name: '', account: '', bank: '', chatText: '', chatImages: [], chatMode: 'image', photo: '', sns: '', url: '', company: '', job: '', workplace: '', biz: '', shop: '', shopUrl: '', claims: '' });
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
const hasUrlIn = (t) => /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|kr|io|xyz|top|vip|co|me|app|site|shop)\b)/i.test(String(t || ''));

// 선택만 보고 어림한 검사 가능 항목 (STEP 4 미리 보기)
function estimateIds() {
  const s = (k) => W.sel.has(k);
  const ids = [];
  if (s('phone')) ids.push('phone');
  if (s('account')) ids.push('account');
  if (s('chat')) ids.push('money', 'invest', 'privacy', 'avoid');
  if (s('chat') && (s('claims') || s('company'))) ids.push('mismatch');
  if (s('photo')) ids.push('photo');
  if (s('url') || s('sns') || s('shop')) ids.push('link');
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
  if (v.url || v.sns || hasUrlIn(v.chatText)) ids.push('link');
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
    name: on('name') ? v.name.trim() : '',
    account: on('account') ? digits(v.account) : '',
    bank: on('account') ? v.bank : '',
    chatText: on('chat') && v.chatMode === 'text' ? v.chatText.trim() : '',
    chatImages: on('chat') && v.chatMode === 'image' ? v.chatImages : [],
    photo: on('photo') ? v.photo : '',
    sns: on('sns') ? v.sns.trim() : '',
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
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('이 사진 형식은 열 수 없습니다. JPG나 PNG로 올려 주세요.');
  }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function openWizard() {
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
  const refresh = () => { if (next) next.disabled = !view.next.ok(); updateChrome(); };
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
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); onFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); });
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
        h('p', { class: 'wz-hint w' }, '이름은 단독으로 찾지 않고 교차검증을 돕는 보조 정보로만 씁니다.')],
      back: false,
      next: { label: '다음', ok: () => W.sel.size > 0, go: () => { buildSteps(); next(); } },
    };
  },

  phone() {
    const el = input('phone', { type: 'tel', inputmode: 'tel', placeholder: '010-1234-5678' }, fmtPhone);
    return {
      body: [...head('상대방 전화번호를 입력해 주세요', '상대에게 직접 받은 번호만 넣어 주세요. 해외 번호는 +로 시작하면 됩니다.'), field('전화번호', el)],
      skip: true,
      next: { label: '다음', ok: () => digits(W.v.phone).length >= 8, go: next },
    };
  },

  name() {
    return {
      body: [...head('상대가 알려 준 이름을 입력해 주세요', '이름만으로는 찾지 않습니다. 번호나 계좌가 나온 글에 같은 이름이 있는지 볼 때만 씁니다.'), field('이름', input('name', { placeholder: '홍길동', maxlength: 30 }))],
      skip: true,
      next: { label: '다음', ok: () => W.v.name.trim().length >= 1, go: next },
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
    const txtPane = h('div', {}, txt, h('p', { class: 'fld-help' }, '말한 사람을 “상대:”와 “나:”로 적으면 상대가 한 말만 골라 분석합니다.'));
    const seg = h('div', { class: 'seg', role: 'tablist' },
      ['image', 'text'].map((m) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(v.chatMode === m), onclick: () => { v.chatMode = m; renderStep(0); } }, m === 'image' ? '캡처 올리기' : '글로 붙여넣기')));
    paint();
    return {
      body: [...head('대화를 올려 주세요', '캡처를 올리면 AI가 글자를 읽습니다. 대화를 글로 붙여 넣어도 됩니다.'), seg, v.chatMode === 'image' ? imgPane : txtPane],
      skip: true,
      onPaste: v.chatMode === 'image' ? (e) => { const f = pastedImages(e); if (f.length) { e.preventDefault(); add(f); } } : null,
      next: { label: '다음', ok: () => (v.chatMode === 'image' ? v.chatImages.length > 0 : v.chatText.trim().length >= 5), go: next },
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
      next: { label: '다음', ok: () => digits(W.v.account).length >= 8, go: next },
    };
  },

  url() {
    return {
      body: [...head('상대방이 보낸 링크를 넣어 주세요', '투자 사이트, 쇼핑몰, 받은 링크를 넣어 주세요. 여러 개면 줄을 바꿔 적습니다.'),
        field('링크', textarea('url', { class: 'inp sm', placeholder: 'https://', spellcheck: 'false' }), h('p', { class: 'fld-help' }, '사이트에 직접 접속하지 않고 공개된 등록 정보만 확인합니다.'))],
      skip: true,
      next: { label: '다음', ok: () => /\.[a-z]{2,}/i.test(W.v.url), go: next },
    };
  },

  sns() {
    return {
      body: [...head('SNS 주소를 입력해 주세요', '인스타그램 주소나 아이디를 넣어 주세요.'),
        field('SNS 주소 또는 아이디', input('sns', { placeholder: 'instagram.com/아이디 또는 @아이디', spellcheck: 'false' }))],
      skip: true,
      next: { label: '다음', ok: () => W.v.sns.trim().length >= 2, go: next },
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
    return {
      body: [...head('회사와 직업을 알려 주세요', '상대가 다닌다고 한 회사나 직업을 넣어 주세요. 하나만 넣어도 됩니다.'),
        field('회사명', input('company', { placeholder: '주식회사 ○○' })),
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
    return {
      body: [...head('쇼핑몰이나 사업체 이름을 알려 주세요', '주소까지 알면 신고 여부와 사이트를 만든 날짜를 함께 확인합니다.'),
        field('상호', input('shop', { placeholder: '○○몰' })),
        field('쇼핑몰 주소', input('shopUrl', { placeholder: '있으면 넣어 주세요', spellcheck: 'false' }))],
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
      body: [...head('상대가 자기에 대해 한 말을 적어 주세요', '사는 곳, 직업, 경력, 운영 기간처럼 확인하고 싶은 말을 적어 주세요. 대화와 맞는지 비교합니다.'), chips, ta],
      skip: true,
      focus: ta,
      next: { label: '다음', ok: () => W.v.claims.trim().length >= 2, go: next },
    };
  },

  confirm() {
    const v = W.val();
    const mask = {
      phone: () => { const d = digits(v.phone); return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : v.phone; },
      name: () => `${v.name.slice(0, 1)}${'*'.repeat(Math.max(1, v.name.length - 1))}`,
      chat: () => (v.chatImages.length ? `캡처 ${v.chatImages.length}장` : `글 ${v.chatText.length.toLocaleString('ko-KR')}자`),
      photo: () => '사진 1장',
      account: () => `${v.bank ? `${v.bank} ` : ''}****${v.account.slice(-4)}`,
      url: () => W.v.url.split(/\s+/).filter(Boolean).join(', '),
      sns: () => v.sns,
      company: () => [v.company, v.job, v.workplace].filter(Boolean).join(', '),
      biz: () => fmtBiz(v.biz),
      shop: () => [v.shop, W.v.shopUrl].filter(Boolean).join(', '),
      claims: () => (v.claims.length > 30 ? `${v.claims.slice(0, 30)}…` : v.claims),
    };
    const rows = INPUTS.filter((x) => W.sel.has(x.key)).map((x) => h('div', { class: 'sum-row' },
      h('dt', {}, x.label), h('dd', {}, mask[x.key]?.() || ''),
      h('button', { type: 'button', class: 'link-btn', onclick: () => go(W.steps.indexOf(x.key), -1) }, '수정')));
    const ids = exactIds();
    const boxes = ['상대방에게 직접 받은 정보만 입력했습니다.', '분석이 끝나면 입력한 원본이 자동으로 삭제되는 것을 확인했습니다.'].map((t, k) => h('label', { class: 'consent' },
      h('input', { type: 'checkbox', checked: W.consent[k], onchange: (e) => { W.consent[k] = e.target.checked; } }), h('span', {}, t)));
    return {
      body: [...head('이대로 사전분석을 시작할까요?', '결제 전에 무엇을 찾았는지 먼저 보여 드립니다.'),
        h('dl', { class: 'sum' }, rows),
        h('p', { class: 'pv-line' }, `총 13개 항목 중 ${ids.length}개 검사 가능`),
        boxes],
      next: { label: '무료 사전분석 시작', rose: true, ok: () => W.consent.every(Boolean) && ids.length > 0, go: () => next() },
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
      body: [...head('교차검증하고 있습니다', '공식 데이터와 공개 자료를 조회하고 대화를 분석합니다. 보통 10초 안팎 걸립니다.'), bar, list, err],
      back: false,
      after: () => runAnalysis(list, bar.firstChild, err),
    };
  },

  preview() {
    const p = W.preview;
    const items = p.items.filter((i) => i.checkable);
    const skipped = p.items.length - items.length;
    const fullSignals = items.filter((i) => i.plan === 'full').reduce((s, i) => s + i.signalCount, 0);
    const stdSignals = items.filter((i) => i.plan === 'standard').reduce((s, i) => s + i.signalCount, 0);
    const chip = (i) => (i.status === 'signal' ? ['st-signal', `확인 신호 ${i.signalCount}건`] : i.status === 'note' ? ['st-note', `참고 ${i.noteCount}건`] : i.status === 'pending' ? ['st-pending', '연동 준비 중'] : ['st-clear', '특이사항 없음']);
    const nN = h('b', {}, '0');
    const nS = h('b', {}, '0');
    const plans = h('div', { class: 'plan-pick' }, ['standard', 'full'].map((k) => h('button', {
      class: 'pp', type: 'button', 'aria-pressed': String(W.plan === k),
      onclick: (e) => { W.plan = k; $$('.pp', plans).forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); },
    },
    k === 'full' && fullSignals ? h('span', { class: 'rec' }, '추천') : null,
    h('b', {}, planLabel(k)), h('p', { class: 'pp-price' }, priceText(k)),
    h('span', {}, k === 'full' ? `공식 데이터와 AI 분석 전부, 확인 신호 ${p.totals.signals}건 공개` : `공식 데이터 검증, 확인 신호 ${stdSignals}건 공개`))));
    return {
      body: [...head('무료 사전분석 결과', null),
        h('p', { class: 'pv-line' }, h('span', { class: 'nw' }, `총 13개 항목 중 ${p.totals.checkable}개 검사 가능`), ' / ', h('span', { class: 'nw' }, `확인 신호 ${p.totals.signals}개 발견`)),
        h('div', { class: 'pv-stat' },
          h('div', {}, h('p', {}, '검사한 항목'), nN, h('p', {}, '13개 중')),
          h('div', { class: 'sig' }, h('p', {}, '확인 신호'), nS, h('p', {}, p.totals.notes ? `참고 ${p.totals.notes}건 별도` : '건'))),
        p.notes?.length ? h('p', { class: 'notice', style: 'margin-bottom:16px' }, p.notes.join(' ')) : null,
        h('div', { class: 'pv-list' }, items.map((i, k) => {
          const [cls, txt] = chip(i);
          return h('div', { class: 'pv-row', style: `animation-delay:${k * 0.05}s` },
            h('span', { class: 'no' }, pad2(i.no)),
            h('span', {}, i.title, h('span', { class: 'lock' }, i.plan === 'full' ? ' · Full Check' : '')),
            h('span', { class: `chip-st ${cls}` }, txt));
        })),
        skipped ? h('p', { class: 'pv-more' }, `정보가 없어 검사하지 않은 항목 ${skipped}개`) : null,
        h('p', { class: 'lbl', style: 'font-weight:800;margin-bottom:10px' }, '리포트 고르기'),
        plans],
      back: false,
      after: () => { countUp(nN, p.totals.checkable, 900); countUp(nS, p.totals.signals, 1100); track('preview_view'); },
      next: { label: '결제하고 리포트 보기', rose: true, ok: () => true, go: () => { track('plan_view'); next(); } },
    };
  },

  pay() {
    const err = h('p', { class: 'err-msg', role: 'alert' });
    return {
      body: [...head('결제', '구독 없이 이번 검증 한 건만 결제합니다.'),
        h('div', { class: 'pay-box' }, h('dl', {},
          h('dt', {}, '상품'), h('dd', {}, `DATE CHECK ${planLabel(W.plan)}`),
          h('dt', {}, '검증 항목'), h('dd', {}, `${W.preview.totals.checkable}개`),
          h('dt', {}, '리포트 보관'), h('dd', {}, '결제 후 24시간'),
          h('dt', {}, '금액'), h('dd', {}, priceText(W.plan)))),
        h('p', { class: 'notice w' }, '시험판이라 결제 수단이 연결돼 있지 않습니다. 아래 버튼을 누르면 테스트 결제로 처리됩니다.'),
        err],
      backTo: 'preview',
      next: {
        label: '테스트 결제 완료', rose: true, ok: () => true,
        go: async () => {
          const btn = $('#wz-next');
          btn.disabled = true;
          try {
            const r = await fetch('/api/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: W.token, plan: W.plan }) });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error);
            keepReport(j);
            resetWizard();
            closeWizard();
            navigate(`/report/${j.id}`);
          } catch (e) {
            err.textContent = e.message || '결제 처리 중 문제가 생겼습니다.';
            btn.disabled = false;
          }
        },
      },
    };
  },
};

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
    const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const j = await r.json().catch(() => ({ error: '검증 중에 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' }));
    if (!r.ok) throw new Error(j.error || '검증 중에 문제가 생겼습니다.');
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
    err.textContent = `${e.message} 이전 단계에서 다시 시도해 주세요.`;
    const foot = $('#wz-foot');
    foot.hidden = false;
    foot.replaceChildren(h('button', { class: 'btn btn-line', type: 'button', onclick: () => go(W.steps.indexOf('confirm'), -1) }, '이전'));
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
    size: [1400, 588],
    imgM: (k) => (k === 'account' ? '/img/howto/police-account-m.webp' : '/img/howto/police-phone-m.webp'),
    sizeM: [780, 874],
    steps: (k) => (KIND_WORD[k]
      ? [`${KIND_WORD[k]}를 복사합니다.`, `경찰민원24 첫 화면의 빨간 상자에서 '${KIND_WORD[k]}'를 고르고, 번호를 붙여 넣은 뒤 조회를 누릅니다.`]
      : ['경찰민원24 첫 화면의 빨간 상자에서 전화번호, 계좌번호, 이메일 중 하나를 고릅니다.', '번호를 넣고 조회를 누릅니다.']),
    note: '최근 3개월 동안 3회 이상 신고된 번호와 비교합니다. 나오지 않아도 안전하다는 뜻은 아닙니다.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 4 5.6v6.1c0 4.9 3.4 8.6 8 9.8 4.6-1.2 8-4.9 8-9.8V5.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m8.6 12 2.4 2.4 4.4-4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  thecheat: {
    name: '더치트',
    btn: '더치트 피해사례 검색',
    sub: '민간 · 피해자가 등록한 사례',
    title: '더치트에서 피해 사례 검색하기',
    img: () => '/img/howto/thecheat.webp',
    size: [1690, 452],
    imgM: () => '/img/howto/thecheat-m.webp',
    sizeM: [1410, 174],
    steps: (k) => [`${KIND_WORD[k] || '번호'}를 복사합니다.`, '더치트 검색 화면의 빨간 상자에 붙여 넣고 검색을 누릅니다.'],
    note: '더치트는 피해자가 직접 등록한 사례를 모은 민간 서비스입니다.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
};
// 예전에 만든 리포트(guide 표시 없음)도 주소로 알아본다
const guideOf = (l) => l.guide || (/minwon24\.police\.go\.kr/.test(l.url) ? 'police' : /thecheat\.co\.kr/.test(l.url) ? 'thecheat' : null);
const svgIcon = (markup) => { const s = h('span', { class: 'lk-ic' }); s.innerHTML = markup; return s; };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했습니다'); return true; } catch { return false; }
}

function openHowto(l, kind) {
  const g = HOWTO[guideOf(l)];
  track(`howto_${guideOf(l)}`);
  const copyBtn = l.copy ? h('button', { class: 'btn btn-line howto-copy', type: 'button', onclick: async (e) => { if (!(await copyText(l.copy))) e.currentTarget.textContent = l.copy; } }, `${l.copy} 복사`) : null;
  sheet(
    h('span', { class: 'howto-k' }, '직접 조회'),
    h('h2', {}, g.title),
    h('ol', { class: 'howto-steps' }, g.steps(kind).map((s) => h('li', {}, h('span', { class: 'w' }, s)))),
    copyBtn,
    h('figure', { class: 'howto-shot' },
      // 폰에서는 그 사이트의 모바일 화면(더치트는 검색 칸만 크게) 캡처
      h('picture', {},
        h('source', { media: '(max-width: 600px)', srcset: g.imgM(kind), width: g.sizeM[0], height: g.sizeM[1] }),
        h('img', { src: g.img(kind), alt: `${g.name} 화면. 빨간 상자가 번호를 넣고 검색하는 곳입니다.`, width: g.size[0], height: g.size[1] })),
      h('figcaption', { class: 'w' }, g.note)),
    h('a', {
      class: 'btn btn-navy howto-go', href: l.url, target: '_blank', rel: 'noopener noreferrer',
      onclick: () => { track(`howto_open_${guideOf(l)}`); if (l.copy) navigator.clipboard?.writeText(l.copy).catch(() => {}); },
    }, l.copy ? `번호 복사하고 ${g.name} 열기` : `${g.name} 열기`, h('span', { 'aria-hidden': 'true' }, '↗')),
    h('p', { class: 'howto-url' }, new URL(l.url).host));
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
      copy ? h('button', { type: 'button', class: 'lk-copy', onclick: async (e) => { if (!(await copyText(copy))) e.currentTarget.textContent = copy; } }, `${copy} 복사`) : null));
}

function linkRow(links, itemId) {
  if (!links?.length) return null;
  const guides = links.filter((l) => HOWTO[guideOf(l)]);
  const rest = links.filter((l) => !HOWTO[guideOf(l)]);
  const kind = guides.find((l) => l.kind)?.kind || (itemId === 'account' ? 'account' : itemId === 'phone' ? 'phone' : null);
  return [
    guides.length ? lookupPanel(guides, kind) : null,
    rest.length ? h('div', { class: 'it-links' }, rest.map((l) => [
      ext(l.url, l.short || l.label),
      l.copy ? h('button', { type: 'button', onclick: async (e) => { if (!(await copyText(l.copy))) e.target.textContent = l.copy; } }, `${l.copy} 복사`) : null,
    ])) : null,
  ];
}

function itemCard(it, id) {
  const [cls, txt] = (STATUS_CHIP[it.status] || STATUS_CHIP.clear)(it);
  const card = h('article', { class: `it ${it.status}${it.locked ? ' locked' : ''}` },
    h('div', { class: 'it-top' },
      h('span', { class: 'it-no' }, pad2(it.no)),
      h('h3', {}, glue(it.title)),
      h('span', { class: `chip-st ${cls}` }, txt)),
    h('div', { class: 'tags' }, (it.sources || []).filter((s) => s !== '더치트 API').map((s) => h('span', {}, s)), ['phone', 'account'].includes(it.id) && (it.sources || []).includes('더치트 API') ? h('span', {}, '경찰민원24·더치트 직접 조회') : null, it.plan === 'full' ? h('span', {}, 'Full Check') : null));
  if (it.locked) {
    card.append(h('div', { class: 'lock-cover' },
      h('p', { class: 'w' }, it.signalCount ? `이 항목에서 확인 신호 ${it.signalCount}건이 나왔습니다. 근거 문장은 Full Check에서 볼 수 있습니다.` : '이 항목의 근거와 상세 내용은 Full Check에서 볼 수 있습니다.'),
      h('button', { class: 'btn btn-rose btn-sm', type: 'button', onclick: () => upgrade(id) }, 'Full Check로 업그레이드')));
    return card;
  }
  for (const s of it.signals || []) {
    card.append(h('div', { class: 'sg' },
      h('div', { class: 'sg-t' }, h('span', { class: `chip-st ${s.level === 'signal' ? 'st-signal' : 'st-note'}` }, s.level === 'signal' ? '확인 신호' : '참고'), h('span', {}, glue(s.title))),
      h('p', { class: 'w' }, s.text),
      (s.evidence || []).map(quote),
      s.sources?.length ? srcList(s.sources) : null,
      linkRow(s.links, it.id)));
  }
  if (it.facts?.length) card.append(h('ul', { class: 'facts' }, it.facts.map((f) => h('li', {}, h('span', { class: 'w' }, f.text), f.sources?.length ? srcList(f.sources) : null))));
  // 예전 리포트에 남은 '더치트 API 제휴 계약 뒤' 안내는 보이지 않게 한다(지금은 직접 조회 안내로 바뀜)
  const pend = (it.pending || []).filter((p) => p.label !== '더치트 API');
  if (pend.length) card.append(h('div', { class: 'pend' }, pend.map((p) => h('div', {}, h('b', {}, glue(p.label)), glue(p.text)))));
  for (const el of linkRow(it.links, it.id) || []) if (el) card.append(el);
  return card;
}

// ---------- 리포트 보관: 서버가 아니라 이 기기에, 암호화된 봉투로 24시간 ----------
const RKEY = 'dc-r-';
const reportCache = new Map();
function keepReport(j) {
  try { localStorage.setItem(RKEY + j.id, JSON.stringify({ token: j.reportToken, exp: j.expiresAt })); } catch { /* 저장 못 해도 이번 화면에서는 연다 */ }
  if (j.report) reportCache.set(j.id, j.report);
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

async function upgrade(id) {
  const s = storedReport(id);
  const r = s ? await fetch('/api/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: s.token, plan: 'full' }) }) : null;
  const j = r ? await r.json().catch(() => ({})) : {};
  if (r?.ok) { keepReport(j); toast('Full Check로 열었습니다'); showReport(id); } else toast(j.error || '리포트 보관 시간이 지났습니다');
}

let countdownTimer = null;
async function showReport(id) {
  const view = $('#report-view');
  view.replaceChildren(h('div', { class: 'rp-empty' }, h('div', { class: 'wrap' }, h('p', {}, '리포트를 여는 중입니다'))));
  scrollTo({ top: 0 });
  let j = reportCache.get(id);
  let error = null;
  if (!j) {
    const s = storedReport(id);
    if (!s) {
      error = '리포트는 서버에 저장하지 않고 검증한 기기에만 24시간 보관합니다. 다른 기기이거나 보관 시간이 지났다면 새로 검증해 주세요.';
    } else {
      try {
        const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: s.token }) });
        j = await r.json();
        if (!r.ok) {
          error = j.error || '리포트를 불러오지 못했습니다.';
          if (r.status === 404 || r.status === 410) localStorage.removeItem(RKEY + id);
          j = null;
        } else reportCache.set(id, j);
      } catch {
        error = '리포트를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      }
    }
  }
  if (!j) {
    view.replaceChildren(h('div', { class: 'rp-empty' }, h('div', { class: 'wrap' },
      h('h1', {}, '리포트를 열 수 없습니다'),
      h('p', { class: 'w' }, error),
      h('button', { class: 'btn btn-rose', type: 'button', onclick: () => { navigate('/'); openWizard(); } }, '새로 검증하기'))));
    glueText(view);
    wrapText(view);
    return;
  }

  const t = j.totals;
  const items = j.items;
  const pending = items.filter((i) => i.status === 'pending').length;
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
        h('span', {}, `${when.getFullYear()}.${pad2(when.getMonth() + 1)}.${pad2(when.getDate())} ${pad2(when.getHours())}:${pad2(when.getMinutes())} 검증`),
        h('span', {}, planLabel(j.plan)),
        left),
      h('div', { class: 'rp-stats' },
        h('div', {}, nN, h('span', {}, '검사한 항목, 13개 중')),
        h('div', { class: 'sig' }, nS, h('span', {}, '확인 신호')),
        h('div', {}, nNote, h('span', {}, '참고')),
        h('div', {}, nP, h('span', {}, '연동 준비 중 항목'))))),
    h('div', { class: 'rp-body' }, h('div', { class: 'wrap' },
      h('div', { class: 'rp-disc' }, h('p', { class: 'w' }, h('b', {}, '분석 결과는 상대방의 신원·안전성을 보증하지 않습니다.'), ' 제공된 정보 범위에서 사실관계와 확인이 필요한 신호를 보여 드립니다. 신호가 있다면 돈을 보내기 전에 한 번 더 확인하세요.')),
      j.meta?.notes?.length ? h('p', { class: 'rp-notes' }, j.meta.notes.join(' ')) : null,
      sec('확인 신호가 있는 항목', group('signal'), '사기에서 자주 보이는 흔적입니다. 근거를 직접 읽어 보세요.'),
      sec('참고할 항목', group('note'), '이것만으로 판단할 수는 없지만 알아 두면 좋은 내용입니다.'),
      sec('특이사항 없는 항목', group('clear'), '찾지 못했다는 뜻이며, 안전하다는 뜻은 아닙니다.'),
      sec('연동 준비 중인 항목', group('pending'), '제휴나 공공데이터 키 연동 뒤 자동으로 조회합니다. 지금은 공식 사이트에서 직접 확인할 수 있습니다.'),
      na.length ? h('section', { class: 'rp-sec' }, h('h2', { class: 'rp-sec-t' }, '검사하지 않은 항목', h('small', {}, `${na.length}개`)),
        h('div', { class: 'na-list' }, na.map((i) => h('span', {}, `${pad2(i.no)} ${i.title}`)))) : null,
      h('section', { class: 'rp-sec' }, h('h2', { class: 'rp-sec-t' }, '공식 조회'),
        h('div', { class: 'off' }, (j.official || []).map((o) => (HOWTO[guideOf(o)]
          ? h('a', { href: o.url, class: 'off-guide', onclick: (e) => { e.preventDefault(); track('official_click'); openHowto(o, null); } }, h('b', {}, o.label), h('span', { class: 'w' }, o.text), h('em', {}, '어디에 검색하는지 보기'))
          : h('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => track('official_click') }, h('b', {}, o.label), h('span', { class: 'w' }, o.text)))))),
      h('section', { class: 'rp-sec' }, h('div', { class: 'sent-box' }, h('h3', {}, '이미 돈을 보냈다면'), h('ol', {}, (j.ifSent || []).map((x) => h('li', {}, x))))),
      h('div', { class: 'rp-actions' },
        h('button', { class: 'btn btn-navy', type: 'button', onclick: () => window.print() }, 'PDF로 저장'),
        h('button', { class: 'btn btn-line', type: 'button', onclick: () => { navigate('/'); openWizard(); } }, '새 검증 시작')))),
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
      onclick: async () => {
        const r = await fetch('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, message: msg.value, contact: contact.value }) });
        const j = await r.json();
        if (!r.ok) { err.textContent = j.error; return; }
        close();
        toast('접수했습니다');
      },
    }, '보내기'));
}

function openPrivacy() {
  sheet(h('h2', {}, '개인정보 처리 안내'),
    ...[
      '입력한 전화번호, 계좌번호, 사진, 대화 원본은 분석이 끝나면 저장하지 않고 파기합니다.',
      '리포트는 서버에 저장하지 않습니다. 서버만 풀 수 있게 암호화해 검증한 기기에만 24시간 보관하고 자동으로 지웁니다.',
      'AI 분석을 위해 대화와 사진을 구글 제미나이 API로 보냅니다. 정식 출시 때 처리방침에 위탁과 국외 이전으로 안내합니다.',
      '성범죄자 공개정보와 범죄경력 정보는 저장하지 않습니다.',
      '관리자 화면에서도 원본 개인정보는 볼 수 없고, 관리자 접속은 기록으로 남습니다.',
    ].map((t) => h('p', { class: 'w' }, t)));
}

// =====================================================================
async function boot() {
  purgeReports();
  try {
    CONFIG = await (await fetch('/api/config')).json();
  } catch { /* 설정 없이도 첫 화면은 뜬다 */ }
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
