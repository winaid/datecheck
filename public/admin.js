// DATE CHECK 관리자 — 기획서 10장(관리자 페이지)과 12장(성공판단 지표)
const $ = (s, r = document) => r.querySelector(s);
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
// 로고 표식 (public/logo-mark.svg 와 같은 모양)
const MARK_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#E8506A" stroke="#E8506A" stroke-linejoin="round"><rect x="4" y="6" width="56" height="42" rx="14" stroke-width="0"/><path d="M15 42 L15.5 57 L31 45 Z" stroke-width="3"/></g><polyline points="19.5,27.5 28,35.5 44.5,18.5" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function logoMark() {
  const s = document.createElement('span');
  s.className = 'logo-mark';
  s.innerHTML = MARK_SVG;
  return s;
}
const root = $('#admin');
const KEY = 'dc-admin-key';
const won = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('ko-KR')}원`);
const pct = (r) => (r == null ? '—' : `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`);
const num = (n) => (n || 0).toLocaleString('ko-KR');
const time = (t) => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const API_NAME = { naver: '네이버 검색 · 공개 웹 언급', whois: 'KISA WHOIS · RDAP', gemini: '제미나이 AI 분석', nts: '국세청 사업자 상태', thecheat: '더치트' };
const TYPE = { delete: '삭제 요청', inquiry: '문의', report: '신고' };

function login(msg) {
  const inp = h('input', { class: 'inp', type: 'password', placeholder: '관리자 키', autocomplete: 'current-password' });
  const err = h('p', { class: 'err-msg' }, msg || '');
  const go = () => { sessionStorage.setItem(KEY, inp.value.trim()); load(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
    h('span', { class: 'logo' }, logoMark(), h('span', { class: 'logo-a' }, 'DATE'), h('span', { class: 'logo-b' }, 'CHECK')),
    h('h2', { style: 'margin-bottom:6px' }, '관리자'),
    h('p', { class: 'desc' }, '서버 .env.local 의 ADMIN_KEY 를 넣어 주세요.'),
    h('div', { class: 'fld' }, inp), err,
    h('button', { class: 'btn btn-navy', type: 'button', style: 'width:100%', onclick: go }, '들어가기'))));
  inp.focus();
}

async function load() {
  const key = sessionStorage.getItem(KEY);
  if (!key) return login();
  const r = await fetch('/api/admin/stats', { headers: { 'x-admin-key': key } });
  if (r.status === 401) { sessionStorage.removeItem(KEY); return login('관리자 키가 맞지 않습니다.'); }
  render(await r.json(), key);
}

function render(s, key) {
  const k = s.kpi;
  const today = s.today.events || {};
  const maxDay = Math.max(1, ...s.daily.map((d) => d.checks));
  const f = s.funnel;
  const stages = [['랜딩 방문', f.landing], ['검증 시작', f.started], ['정보 입력 완료', f.analyzed], ['무료 결과 확인', f.previewed], ['결제', f.paid]];
  const top = Math.max(1, f.landing, f.started, f.analyzed);
  const chart = h('div', { class: 'chart' }, s.daily.map((d) => h('div', { class: 'col', title: `${d.day} 검사 ${d.checks} · 결제 ${d.paid}` },
    h('span', { class: 'v' }, d.checks || ''),
    h('div', { class: 'bar', style: `height:${(d.checks / maxDay) * 150}px` }),
    d.paid ? h('div', { class: 'bar paid', style: `height:${(d.paid / maxDay) * 150}px` }) : null)));
  const fn = h('div', { class: 'fn' }, stages.map(([label, n], i) => h('div', { class: 'fn-row' },
    h('span', {}, label),
    h('div', { class: 'fn-track' }, h('i', { 'data-w': `${(n / top) * 100}%` })),
    h('b', {}, num(n), h('small', {}, i ? pct(stages[i - 1][1] ? n / stages[i - 1][1] : null) : '')))));

  const metric = (label, val, note) => h('div', { class: 'metric' }, h('span', {}, label), h('b', {}, val), note ? h('em', {}, note) : null);
  const reqRows = s.requests.length
    ? s.requests.map((q) => h('tr', {},
      h('td', {}, time(q.at)),
      h('td', {}, h('span', { class: `tag-t ${q.type}` }, TYPE[q.type] || q.type)),
      h('td', { class: 'msg' }, q.message),
      h('td', {}, q.contact || '—'),
      h('td', {}, h('label', { class: 'consent', style: 'padding:0' }, h('input', {
        type: 'checkbox', checked: q.done,
        onchange: (e) => fetch('/api/admin/request-done', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ id: q.id, done: e.target.checked }) }),
      }), h('span', {}, '처리')))))
    : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, '들어온 요청이 없습니다.'))];

  root.replaceChildren(
    h('header', { class: 'ad-top' }, h('div', { class: 'wrap' },
      h('a', { class: 'logo', href: '/' }, logoMark(), h('span', { class: 'logo-a' }, 'DATE'), h('span', { class: 'logo-b' }, 'CHECK')),
      h('small', {}, `관리자 · ${time(s.generatedAt)} 기준`),
      h('span', { class: 'sp' }),
      h('button', { class: 'btn btn-glass', type: 'button', onclick: load }, '새로고침'),
      h('button', { class: 'btn btn-glass', type: 'button', onclick: () => { sessionStorage.removeItem(KEY); login(); } }, '나가기'))),
    h('main', { class: 'ad-main' }, h('div', { class: 'wrap' },
      h('p', { class: 'ad-note w' }, '원본 개인정보는 저장하지 않아 관리자도 볼 수 없습니다. 이 화면을 열면 관리자 접근 로그에 남습니다. 원가는 단가 추정치입니다.'),
      s.storage === 'ephemeral' ? h('p', { class: 'ad-note ad-warn w' }, 'Vercel 에서는 집계와 문의가 함수 임시 폴더에 쌓여 함수가 다시 시작되면 사라지고, 함수마다 따로 셉니다. 정식 운영 전에 Upstash Redis 같은 저장소를 연결해야 합니다.') : null,
      h('div', { class: 'ad-grid' },
        h('div', { class: 'kpi' }, h('span', {}, '오늘 검사'), h('b', {}, num(today.inputs_done)), h('em', {}, `무료 결과 확인 ${num(today.preview_view)}건`)),
        h('div', { class: 'kpi' }, h('span', {}, '오늘 결제'), h('b', {}, num((today.paid_standard || 0) + (today.paid_full || 0))), h('em', {}, `Standard ${num(today.paid_standard)} · Full ${num(today.paid_full)}`)),
        h('div', { class: 'kpi' }, h('span', {}, '30일 매출'), h('b', {}, s.prices.standard || s.prices.full ? won(s.revenue) : '가격 미정'), h('em', {}, `객단가 ${k.aov == null ? '—' : won(k.aov)}`)),
        h('div', { class: 'kpi' }, h('span', {}, '검사 1건당 원가'), h('b', {}, won(k.costPerCheck)), h('em', {}, 'API와 AI 합계')),
        h('div', { class: 'kpi' }, h('span', {}, '30일 AI 비용'), h('b', {}, won(s.aiKrw)), h('em', {}, '제미나이 토큰 기준'))),
      h('div', { class: 'two row-gap' },
        h('div', { class: 'card' }, h('h2', {}, '일일 검사건수'), h('p', { class: 'desc' }, '최근 14일'), chart,
          h('div', { class: 'days' }, s.daily.map((d) => h('span', {}, d.day.slice(8)))),
          h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--navy-600)' }), '검사'), h('span', {}, h('i', { style: 'background:var(--rose)' }), '결제'))),
        h('div', { class: 'card' }, h('h2', {}, '무료에서 유료까지'), h('p', { class: 'desc' }, '최근 30일, 오른쪽은 앞 단계 대비'), fn)),
      h('div', { class: 'card' }, h('h2', {}, 'MVP 성공판단 지표'), h('p', { class: 'desc' }, '기획서 12장 기준, 최근 30일'),
        h('div', { class: 'metrics' },
          metric('랜딩 → 검사 시작률', pct(k.startRate)),
          metric('정보입력 완료율', pct(k.inputDoneRate)),
          metric('무료결과 → 결제율', pct(k.payRate)),
          metric('Standard → Full 전환율', pct(k.upgradeRate), `Full 비중 ${pct(k.fullShare)}`),
          metric('평균 객단가', k.aov == null ? '가격 미정' : won(k.aov)),
          metric('검사 1건당 API·AI 원가', won(k.costPerCheck)),
          metric('재사용률', pct(k.reuseRate), '두 번 이상 검사한 방문자'),
          metric('환불률', pct(k.refundRate)),
          metric('고객획득비용', '—', '광고비 연동 필요'))),
      h('div', { class: 'two row-gap' },
        h('div', { class: 'card' }, h('h2', {}, 'API별 호출량·실패율·원가'), h('p', { class: 'desc' }, '서버 켠 뒤 누적'),
          h('div', { class: 'scroll-x' }, h('table', {},
            h('thead', {}, h('tr', {}, h('th', {}, 'API'), h('th', { class: 'num' }, '호출'), h('th', { class: 'num' }, '실패율'), h('th', { class: 'num' }, '평균 응답'), h('th', { class: 'num' }, '원가'))),
            h('tbody', {}, s.api.length ? s.api.map((a) => h('tr', {}, h('td', {}, API_NAME[a.name] || a.name), h('td', { class: 'num' }, num(a.calls)), h('td', { class: 'num' }, pct(a.failRate)), h('td', { class: 'num' }, `${(a.avgMs / 1000).toFixed(1)}초`), h('td', { class: 'num' }, a.krw ? won(a.krw) : '무료'))) : h('tr', {}, h('td', { colspan: 5, class: 'empty' }, '아직 호출이 없습니다.')),
              h('tr', {}, h('td', {}, '더치트'), h('td', { class: 'num', colspan: 4 }, '제휴 계약 전')))))),
        h('div', { class: 'card' }, h('h2', {}, '개인정보 자동삭제 현황'), h('p', { class: 'desc' }, '원본은 분석 직후, 리포트는 보관 시간이 지나면 삭제'),
          h('div', { class: 'purge' },
            metric('파기한 원본', `${num(s.purge.originals)}건`, '입력 항목 기준'),
            metric('서버 보관 리포트', '0건', '이용자 기기에 암호화해 24시간'),
            metric('마지막 파기', s.purge.lastAt ? time(s.purge.lastAt) : '—', '분석 직후 원본 파기'),
            metric('집계 저장', s.storage === 'ephemeral' ? '임시' : '파일', s.storage === 'ephemeral' ? '함수 재시작 때 사라짐' : 'data 폴더')))),
      h('div', { class: 'card' }, h('h2', {}, '삭제요청·문의·신고'), h('p', { class: 'desc' }, '최근 100건'),
        h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '접수'), h('th', {}, '종류'), h('th', {}, '내용'), h('th', {}, '연락처'), h('th', {}, '처리'))), h('tbody', {}, reqRows)))),
      h('div', { class: 'card' }, h('h2', {}, '관리자 접근로그'), h('p', { class: 'desc' }, '최근 60건'),
        h('div', { class: 'scroll-x' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '시각'), h('th', {}, '동작'), h('th', {}, '접속 주소'))),
          h('tbody', {}, s.adminLog.map((l) => h('tr', {}, h('td', {}, time(l.at)), h('td', {}, l.action), h('td', {}, l.ip))))))),
    )),
  );
  window.__wrap?.(root);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    chart.classList.add('in');
    fn.querySelectorAll('[data-w]').forEach((i) => { i.style.width = i.dataset.w; });
  }));
}

load();
