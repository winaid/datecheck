// DATE CHECK 관리자 — 기획서 10장(관리자 페이지)과 12장(성공판단 지표). 2026-10-27 결제를 없애고 회원·가입·조회 숫자로
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
const API_NAME = { naver: '네이버 검색 (예전 기록, 지금은 쓰지 않음)', vision: '구글 Vision 사진 웹 검색', whois: 'KISA WHOIS · RDAP', gemini: '제미나이 AI 분석', nts: '국세청 사업자 상태', ftc_mail: '공정위 통신판매사업자', ftc_door: '공정위 방문판매사업자', fsc_corp: '금융위 기업기본정보', ftc_sponsor: '공정위 후원방문판매사업자', ftc_mlm: '공정위 다단계판매사업자', hira: '심평원 병원정보', thecheat: '더치트' };
const TYPE = { delete: '삭제 요청', inquiry: '문의', report: '신고' };
const PROVIDER = { email: '이메일', google: '구글', kakao: '카카오' };
const day = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

// 표 → CSV(엑셀 한글 BOM). = + - @ 로 시작하는 칸은 엑셀 수식으로 읽히지 않게 앞에 ' (2026-10-28)
function downloadCsv(name, head, rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const stamp = day(new Date().toISOString()).replace(/\./g, '-');
  const a = h('a', { href: URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), text], { type: 'text/csv;charset=utf-8' })), download: `${name}-${stamp}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}

// 회원 목록 — 이메일로 찾기 · CSV (최근 가입 500명, 데이터베이스 admin_members)
function memberCard(list) {
  if (!list) return null;
  const body = h('tbody', {});
  const draw = (q) => {
    const k = q.trim().toLowerCase();
    const rows = k ? list.filter((u) => String(u.email || '').toLowerCase().includes(k)) : list;
    body.replaceChildren(...(rows.length ? rows.map((u) => h('tr', {},
      h('td', {}, u.email || '—', u.confirmed ? null : h('small', { style: 'margin-left:6px;color:var(--rose)' }, '메일 미확인')),
      h('td', {}, PROVIDER[u.provider] || u.provider),
      h('td', { class: 'num' }, num(u.checks)),
      h('td', { class: 'num' }, num(u.stored)),
      h('td', { class: 'num' }, day(u.created_at)),
      h('td', { class: 'num' }, day(u.last_sign_in_at))))
      : [h('tr', {}, h('td', { colspan: 6, class: 'empty' }, list.length ? '찾는 회원이 없습니다.' : '아직 회원이 없습니다.'))]));
    return rows;
  };
  let shown = draw('');
  const search = h('input', { class: 'inp', type: 'search', placeholder: '이메일로 찾기', 'aria-label': '이메일로 찾기', style: 'max-width:260px', oninput: (e) => { shown = draw(e.target.value); } });
  const csv = h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => downloadCsv('datecheck-회원', ['이메일', '가입 방식', '메일 확인', '조회 수', '보관 중 기록', '가입일', '마지막 로그인'], shown.map((u) => [u.email, PROVIDER[u.provider] || u.provider, u.confirmed ? '예' : '아니오', u.checks, u.stored, day(u.created_at), day(u.last_sign_in_at)])) }, 'CSV 내려받기');
  return h('div', { class: 'card' }, h('h2', {}, `회원 목록 ${num(list.length)}명`), h('p', { class: 'desc' }, '최근 가입 500명 · 조회 수는 최근 90일'),
    h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:4px 0 12px' }, search, csv),
    h('div', { class: 'scroll-x', style: 'max-height:460px;overflow:auto' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, '이메일'), h('th', {}, '가입 방식'), h('th', { class: 'num' }, '조회'), h('th', { class: 'num' }, '보관 중'), h('th', { class: 'num' }, '가입일'), h('th', { class: 'num' }, '마지막 로그인'))),
      body)));
}

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
  // 연결이 끊기거나 서버 오류면 키는 지우지 않고 이유만 알린다(2026-10-26)
  let r;
  try {
    r = await fetch('/api/admin/stats', { headers: { 'x-admin-key': key } });
  } catch {
    return login('서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 들어가 주세요.');
  }
  if (r.status === 401) { sessionStorage.removeItem(KEY); return login('관리자 키가 맞지 않습니다. 다시 입력해 주세요.'); }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) return login('통계를 불러오지 못했습니다. 잠시 뒤 다시 들어가 주세요.');
  render(j, key);
}

function render(s, key) {
  const k = s.kpi;
  const m = s.members; // 데이터베이스 숫자(회원·가입·조회) — 없으면 함수 집계만
  const today = s.today.events || {};
  // 일일 조회·가입은 데이터베이스 기록이 있으면 그것으로(함수마다 따로 세는 임시 집계보다 정확)
  const daily = m?.daily?.length ? m.daily : s.daily;
  const maxDay = Math.max(1, ...daily.map((d) => Math.max(d.checks || 0, d.signups || 0)));
  const f = s.funnel;
  const stages = [['랜딩 방문', f.landing], ['로그인 창 열기', f.authOpen], ['가입', f.signups], ['조회 시작', f.started], ['조회 완료', f.analyzed], ['리포트 다시 열기', f.viewed]];
  const top = Math.max(1, ...stages.map(([, n]) => n || 0));
  const chart = h('div', { class: 'chart' }, daily.map((d) => h('div', { class: 'col', title: `${d.day} 조회 ${d.checks} · 가입 ${d.signups}` },
    h('span', { class: 'v' }, d.checks || ''),
    h('div', { class: 'bar', style: `height:${(d.checks / maxDay) * 150}px` }),
    d.signups ? h('div', { class: 'bar paid', style: `height:${(d.signups / maxDay) * 150}px` }) : null)));
  const fn = h('div', { class: 'fn' }, stages.map(([label, n], i) => h('div', { class: 'fn-row' },
    h('span', {}, label),
    h('div', { class: 'fn-track' }, h('i', { 'data-w': `${((n || 0) / top) * 100}%` })),
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
        // 저장이 안 되면 체크를 되돌리고 알린다
        onchange: (e) => {
          const box = e.target;
          fetch('/api/admin/request-done', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ id: q.id, done: box.checked }) })
            .then((r) => { if (!r.ok) throw new Error(); })
            .catch(() => { box.checked = !box.checked; alert('처리 표시를 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); });
        },
      }), h('span', {}, '처리')))))
    : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, '들어온 요청이 없습니다.'))];
  const todayRow = daily[daily.length - 1] || {};
  const providers = m?.providers ? Object.entries(m.providers).map(([p, n]) => `${PROVIDER[p] || p} ${num(n)}`).join(' · ') : '데이터베이스 연결 전';

  root.replaceChildren(
    h('header', { class: 'ad-top' }, h('div', { class: 'wrap' },
      h('a', { class: 'logo', href: '/' }, logoMark(), h('span', { class: 'logo-a' }, 'DATE'), h('span', { class: 'logo-b' }, 'CHECK')),
      h('small', {}, `관리자 · ${time(s.generatedAt)} 기준`),
      h('span', { class: 'sp' }),
      h('button', { class: 'btn btn-glass', type: 'button', onclick: load }, '새로고침'),
      h('button', { class: 'btn btn-glass', type: 'button', onclick: () => { sessionStorage.removeItem(KEY); login(); } }, '나가기'))),
    h('main', { class: 'ad-main' }, h('div', { class: 'wrap' },
      h('p', { class: 'ad-note w' }, '사진과 대화 같은 원본 개인정보는 저장하지 않고, 조회 결과는 암호화돼 있어 관리자도 볼 수 없습니다. 이 화면을 열면 관리자 접근 로그에 남습니다. 원가는 단가 추정치입니다.'),
      m ? null : h('p', { class: 'ad-note ad-warn w' }, '데이터베이스(Supabase)에 연결하지 못해 회원 숫자를 보여 드리지 못했습니다. 아래 숫자는 함수마다 따로 세는 임시 집계입니다.'),
      m && s.storage !== 'database' ? h('p', { class: 'ad-note ad-warn w' }, '방문·퍼널·API 원가 숫자는 이 서버가 켜진 뒤 센 임시 집계입니다(데이터베이스 집계를 읽지 못함).') : null,
      h('div', { class: 'ad-grid' },
        h('div', { class: 'kpi' }, h('span', {}, '전체 회원'), h('b', {}, m ? num(m.users) : '—'), h('em', {}, providers)),
        h('div', { class: 'kpi' }, h('span', {}, '오늘 가입'), h('b', {}, num(todayRow.signups)), h('em', {}, '한국 시간 기준')),
        h('div', { class: 'kpi' }, h('span', {}, '오늘 조회'), h('b', {}, num(m ? todayRow.checks : today.inputs_done)), h('em', {}, m ? `보관 중인 조회 기록 ${num(m.reportsStored)}건` : '함수 임시 집계')),
        h('div', { class: 'kpi' }, h('span', {}, '조회 1건당 원가'), h('b', {}, won(k.costPerCheck)), h('em', {}, 'API와 AI 합계')),
        h('div', { class: 'kpi' }, h('span', {}, '30일 AI 비용'), h('b', {}, won(s.aiKrw)), h('em', {}, `API 전체 ${won(s.apiKrw)}`))),
      h('div', { class: 'two row-gap' },
        h('div', { class: 'card' }, h('h2', {}, '일일 조회·가입'), h('p', { class: 'desc' }, '최근 14일'), chart,
          h('div', { class: 'days' }, daily.map((d) => h('span', {}, d.day.slice(8)))),
          h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--navy-600)' }), '조회'), h('span', {}, h('i', { style: 'background:var(--rose)' }), '가입'))),
        h('div', { class: 'card' }, h('h2', {}, '방문에서 조회까지'), h('p', { class: 'desc' }, '최근 30일 화면 집계, 오른쪽은 앞 단계 대비'), fn)),
      h('div', { class: 'card' }, h('h2', {}, '성공판단 지표'), h('p', { class: 'desc' }, '최근 30일'),
        h('div', { class: 'metrics' },
          metric('랜딩 → 조회 시작률', pct(k.startRate)),
          metric('로그인 창 → 가입률', pct(k.signupRate)),
          metric('조회 시작 → 완료율', pct(k.inputDoneRate)),
          metric('조회 1건당 API·AI 원가', won(k.costPerCheck)),
          metric('재사용률', pct(k.reuseRate), '두 번 이상 조회한 방문자'))),
      h('div', { class: 'two row-gap' },
        h('div', { class: 'card' }, h('h2', {}, 'API별 호출량·실패율·원가'), h('p', { class: 'desc' }, s.storage === 'database' ? '최근 30일' : '서버 켠 뒤 누적'),
          h('div', { class: 'scroll-x' }, h('table', {},
            h('thead', {}, h('tr', {}, h('th', {}, 'API'), h('th', { class: 'num' }, '호출'), h('th', { class: 'num' }, '실패율'), h('th', { class: 'num' }, '평균 응답'), h('th', { class: 'num' }, '원가'))),
            h('tbody', {}, s.api.length ? s.api.map((a) => h('tr', {}, h('td', {}, API_NAME[a.name] || a.name), h('td', { class: 'num' }, num(a.calls)), h('td', { class: 'num' }, pct(a.failRate)), h('td', { class: 'num' }, `${(a.avgMs / 1000).toFixed(1)}초`), h('td', { class: 'num' }, a.krw ? won(a.krw) : '무료'))) : h('tr', {}, h('td', { colspan: 5, class: 'empty' }, '아직 호출이 없습니다.')),
              h('tr', {}, h('td', {}, '더치트·경찰민원24'), h('td', { class: 'num', colspan: 4 }, '자동 조회 없음 · 직접 조회 안내')))))),
        h('div', { class: 'card' }, h('h2', {}, '개인정보 자동삭제 현황'), h('p', { class: 'desc' }, '원본은 분석 직후, 조회 기록은 30일 뒤 매시간 자동 삭제'),
          h('div', { class: 'purge' },
            metric('파기한 원본', `${num(s.purge.originals)}건`, '입력 항목 기준'),
            metric('보관 중인 조회 기록', m ? `${num(m.reportsStored)}건` : '—', '암호화해 30일'),
            metric('마지막 파기', s.purge.lastAt ? (s.purge.lastIsDay ? day(s.purge.lastAt) : time(s.purge.lastAt)) : '—', '분석 직후 원본 파기'),
            metric('회원·문의 저장', m ? '데이터베이스' : '임시', m ? 'Supabase 서울' : '함수 재시작 때 사라짐')))),
      memberCard(s.memberList),
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
