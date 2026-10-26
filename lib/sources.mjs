// 공식 데이터·공개 자료 확인 — 기획서 4장 표와 5.1·5.4·5.5
// 각 함수는 항목 조각 { signals, facts, pending, links } 를 돌려준다.
// 2026-10-22: 네이버 검색 API 는 쓰지 않는다(약관상 유료 서비스에 쓸 수 없음) — 공개 글은 '네이버에서 직접 보기' 버튼으로 이용자가 찾는다.
import { recordApi } from './store.mjs';
import { LINKS, ftcBizLink, naverSearch } from './links.mjs';
import { isSnsUrl, companyName, nameKey } from '../public/parse-input.js';
import { searchHiraList, asOfText } from './hira-list.mjs';

const part = () => ({ signals: [], facts: [], pending: [], links: [] });

// ===================== 전화번호 · 계좌번호 =====================
const COUNTRY = {
  1: '미국·캐나다', 7: '러시아', 33: '프랑스', 44: '영국', 49: '독일', 60: '말레이시아', 61: '호주',
  62: '인도네시아', 63: '필리핀', 64: '뉴질랜드', 65: '싱가포르', 66: '태국', 81: '일본', 84: '베트남',
  86: '중국', 90: '튀르키예', 91: '인도', 95: '미얀마', 233: '가나', 234: '나이지리아', 852: '홍콩',
  853: '마카오', 855: '캄보디아', 856: '라오스', 886: '대만', 971: '아랍에미리트',
};
const SCAM_HUB = new Set(['855', '95', '856']);

export function parsePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const compact = s.replace(/[\s\-().]/g, '');
  let d = compact.replace(/\D/g, '');
  if (!d) return null;
  if (compact.startsWith('+') || /^00[1-9]/.test(compact)) {
    if (compact.startsWith('00')) d = d.replace(/^00/, '');
    if (d.startsWith('82')) d = `0${d.slice(2).replace(/^0/, '')}`;
    else {
      const cc = [3, 2, 1].map((n) => d.slice(0, n)).find((c) => COUNTRY[c]);
      return { kind: 'foreign', digits: d, cc: cc || '', country: COUNTRY[cc] || '', display: `+${d}` };
    }
  }
  // '821012345678' 처럼 + 없이 국가번호부터 적은 경우
  if (/^82(1[016789]\d{7,8}|70\d{8})$/.test(d)) d = `0${d.slice(2)}`;
  if (/^01[016789]\d{7,8}$/.test(d)) return { kind: 'mobile', digits: d, display: d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^070\d{8}$/.test(d)) return { kind: 'internet', digits: d, display: d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3') };
  if (/^050\d{8,9}$/.test(d)) return { kind: 'virtual', digits: d, display: d.replace(/^(\d{4})(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^02\d{7,8}$/.test(d)) return { kind: 'landline', digits: d, display: d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^0[3-6]\d\d{7,8}$/.test(d)) return { kind: 'landline', digits: d, display: d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^1[5-9]\d{6}$/.test(d)) return { kind: 'rep', digits: d, display: d.replace(/^(\d{4})(\d{4})$/, '$1-$2') };
  return { kind: 'invalid', digits: d, display: s };
}

// 공개 글은 자동으로 찾지 않고, 이용자가 네이버 검색 결과를 직접 보도록 버튼만 둔다.
// 번호만 검색하면 그 사람에 관한 글이 다 나와 사람 찾기가 되니 '사기'를 붙여 사기·피해 글로 좁힌다(2026-10-26, 회사 검색과 같게)
function mentionPart(out, { what, query }) {
  out.links.push(naverSearch(`"${query}" 사기`, `네이버에서 ${what} 사기 글 검색`));
  out.facts.push({ tip: true, text: `${what}가 사기·피해 글에 나온 적이 있는지 네이버 버튼으로 직접 찾아보세요. 예전에 다른 사람이 쓰던 번호일 수도 있으니 글 날짜를 함께 보세요.` });
}

export async function phonePart(raw) {
  const out = part();
  const p = parsePhone(raw);
  if (!p) return out;
  if (p.kind === 'invalid') {
    out.signals.push({ level: 'note', title: '번호 형식이 국내 전화번호와 맞지 않습니다', text: `입력한 번호(${p.display})를 다시 확인해 주세요.` });
    return out;
  }
  if (p.kind === 'foreign') {
    const hub = SCAM_HUB.has(p.cc);
    out.signals.push({
      level: hub ? 'signal' : 'note',
      title: `해외 번호입니다${p.country ? `. ${p.country}` : ''}`,
      text: `+${p.cc || '?'}로 시작하는 번호입니다. 국내에 산다고 했다면 말과 맞는지 확인이 필요합니다.${hub ? ' 온라인 사기 조직이 모여 있다고 여러 번 보도된 지역입니다.' : ''}`,
    });
  } else if (p.kind === 'internet') {
    out.signals.push({ level: 'note', title: '인터넷 전화 070 번호입니다', text: '해외에서도 국내 번호처럼 걸 수 있어 사기에 자주 쓰입니다. 개인 연락처로 070을 쓰는 경우는 드뭅니다.' });
  } else if (p.kind === 'virtual') {
    out.signals.push({ level: 'note', title: '안심번호(가상 번호)입니다', text: '진짜 번호를 가리는 번호라 이것만으로는 누구 번호인지 확인하기 어렵습니다.' });
  } else {
    out.facts.push({ text: `${p.kind === 'mobile' ? '휴대전화' : '일반 전화'} 번호 형식입니다.` });
  }
  // 경찰·더치트 피해 이력은 자동 조회하지 않는다 — 이용자가 직접 찾도록 안내 팝업(화면 캡처)으로 연결
  out.links.push({ ...LINKS.police, copy: p.display, kind: 'phone' }, { ...LINKS.thecheat, copy: p.display, kind: 'phone' });
  mentionPart(out, { what: '이 번호', query: p.display });
  return out;
}

export async function accountPart(raw, bank) {
  const out = part();
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return out;
  if (digits.length < 8) {
    out.signals.push({ level: 'note', title: '계좌번호가 너무 짧습니다', text: '계좌번호는 보통 10~14자리입니다. 다시 확인해 주세요.' });
    return out;
  }
  if (bank) out.facts.push({ text: `${bank} 계좌로 입력했습니다.` });
  out.links.push({ ...LINKS.police, copy: digits, kind: 'account' }, { ...LINKS.thecheat, copy: digits, kind: 'account' });
  mentionPart(out, { what: '이 계좌번호', query: digits });
  return out;
}

// ===================== URL · 도메인 (5.4) — SNS 계정은 받지 않는다(2026-10-26) =====================
const EXCHANGES = { 'upbit.com': '업비트', 'bithumb.com': '빗썸', 'coinone.co.kr': '코인원', 'korbit.co.kr': '코빗', 'gopax.co.kr': '고팍스' };
const BANKS = {
  'kbstar.com': 'KB국민은행', 'shinhan.com': '신한은행', 'wooribank.com': '우리은행', 'kebhana.com': '하나은행', 'hanabank.com': '하나은행',
  'nonghyup.com': 'NH농협', 'ibk.co.kr': 'IBK기업은행', 'kakaobank.com': '카카오뱅크', 'kbanknow.com': '케이뱅크', 'toss.im': '토스',
  'fss.or.kr': '금융감독원', 'police.go.kr': '경찰청',
};
const PLATFORMS = new Set([
  'naver.com', 'naver.me', 'kakao.com', 'daum.net', 'google.com', 'youtube.com', 'youtu.be', 'instagram.com', 'facebook.com',
  'x.com', 'twitter.com', 'tiktok.com', 'linkedin.com', 'coupang.com', 'daangn.com', 'threads.net', 'notion.site', 'notion.so',
  'tistory.com', 'apple.com', 'github.com', 'github.io', 'behance.net', 'microsoft.com', 'smartstore.naver.com',
]);
const SHORTENERS = new Set(['bit.ly', 'me2.do', 'han.gl', 'vo.la', 'url.kr', 'tinyurl.com', 't.ly', 'goo.gl', 'buly.kr', 'c11.kr', 'is.gd', 'cutt.ly', 'shorturl.at', 'rebrand.ly', 't.co']);
const RISKY_TLD = new Set(['xyz', 'top', 'vip', 'icu', 'cyou', 'sbs', 'cfd', 'bond', 'buzz', 'rest', 'monster', 'lol']);
const SECOND_LEVEL = new Set(['co.kr', 'or.kr', 'go.kr', 'ne.kr', 're.kr', 'pe.kr', 'ac.kr', 'co.jp', 'co.uk', 'com.cn', 'com.hk', 'com.au', 'com.sg', 'com.tw', 'com.vn', 'com.ph', 'com.my']);
const URL_RE = /(https?:\/\/[^\s<>"'()]+|www\.[^\s<>"'()]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|kr|io|xyz|top|vip|cc|me|app|site|online|shop|info|biz|asia|club|icu|cyou|sbs|cfd|bond|buzz|link|pro|live|ly|gl|do|im|co)\b[^\s<>"'()]*)/gi;

export function extractUrls(text) {
  return [...String(text || '').matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?)\]]+$/, ''));
}

export function parseHost(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `http://${s}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!host.includes('.')) return null;
    const parts = host.split('.');
    const last2 = parts.slice(-2).join('.');
    const registrable = SECOND_LEVEL.has(last2) && parts.length >= 3 ? parts.slice(-3).join('.') : last2;
    return { host, registrable, path: u.pathname, isIp: /^\d{1,3}(\.\d{1,3}){3}$/.test(host) };
  } catch {
    return null;
  }
}

const label = (d) => d.split('.')[0];
function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

export function lookalike(reg) {
  const own = label(reg);
  for (const [domain, name] of Object.entries({ ...EXCHANGES, ...BANKS })) {
    const off = label(domain);
    if (off.length >= 5 && lev(own, off) === 1) return { domain, name, title: `${name} 주소와 한 글자만 다른 주소입니다` };
  }
  for (const [domain, name] of Object.entries(EXCHANGES)) {
    if (own.includes(label(domain)) && reg !== domain) return { domain, name, title: `${name} 이름을 넣은 다른 주소입니다` };
  }
  return null;
}

const RDAP_HEADERS = { accept: 'application/rdap+json, application/json', 'user-agent': 'date-check/0.1 (local prototype)' };
let bootstrap = { at: 0, map: null };
async function rdapBase(tld) {
  if (!bootstrap.map || Date.now() - bootstrap.at > 86400000) {
    const r = await fetch('https://data.iana.org/rdap/dns.json', { headers: RDAP_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`iana ${r.status}`);
    const j = await r.json();
    const map = {};
    for (const [tlds, urls] of j.services || []) for (const t of tlds) map[t] = urls.find((u) => u.startsWith('https')) || urls[0];
    bootstrap = { at: Date.now(), map };
  }
  return bootstrap.map[tld] || null;
}

// 도메인 등록 정보 — KISA WHOIS 와 같은 공개 정보를 국제 표준(RDAP)으로 조회한다. .kr 은 KISA 서버가 답한다.
export async function rdapLookup(domain) {
  const base = await rdapBase(domain.split('.').pop()).catch(() => null);
  const url = base ? `${base.replace(/\/?$/, '/')}domain/${encodeURIComponent(domain)}` : `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, { headers: RDAP_HEADERS, signal: AbortSignal.timeout(9000) });
  } finally {
    recordApi('whois', { ok: Boolean(r && (r.ok || r.status === 404)), ms: Date.now() - t0 });
  }
  if (r.status === 404) return { notFound: true };
  if (!r.ok) throw new Error(`rdap ${r.status}`);
  const j = await r.json();
  const reg = (j.events || []).find((e) => /registration/i.test(e.eventAction || ''));
  const exp = (j.events || []).find((e) => /expiration/i.test(e.eventAction || ''));
  const registrar = (j.entities || []).find((e) => (e.roles || []).includes('registrar'));
  return { created: reg?.eventDate || null, expires: exp?.eventDate || null, registrar: registrar?.vcardArray?.[1]?.find((x) => x[0] === 'fn')?.[3] || '' };
}

const ymd = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
function ageText(days) {
  if (days < 60) return `${days}일`;
  if (days < 730) return `${Math.round(days / 30)}개월`;
  return `${Math.floor(days / 365)}년`;
}

// hints = AI 가 대화·상대가 한 말에서 읽은 { years: 말한 운영 기간, crypto: 코인 거래소·투자 사이트 권유 } 를 내는 Promise.
// 낱말 규칙으로 읽지 않는다('연애 5년'을 운영 기간으로, 코인 뉴스 이야기를 권유로 읽는 일이 생겨서, 2026-10-26 오너)
async function hostPart(out, h, { hints, fromChat }) {
  const where = fromChat ? '대화에 나온 주소입니다. ' : '';
  const tag = h.host;
  if (h.isIp) {
    out.signals.push({ level: 'signal', title: `${tag} 이름 대신 숫자로 된 주소입니다`, text: `${where}정상적인 회사나 서비스는 숫자로만 된 주소를 거의 쓰지 않습니다.` });
    return;
  }
  if (h.host.includes('xn--')) out.signals.push({ level: 'signal', title: `${tag} 다른 글자처럼 보이게 만든 주소일 수 있습니다`, text: `${where}외국 문자를 섞어 유명한 주소처럼 보이게 만든 주소입니다.` });
  if (SHORTENERS.has(h.registrable)) {
    out.signals.push({ level: 'note', title: `${tag} 단축 주소라 실제 주소가 가려져 있습니다`, text: `${where}눌렀을 때 어디로 가는지 미리 알 수 없습니다. 앱 설치나 로그인으로 이어지면 멈추세요.` });
    return;
  }
  if (EXCHANGES[h.registrable] || BANKS[h.registrable]) {
    out.facts.push({ text: `${tag}는 ${EXCHANGES[h.registrable] || BANKS[h.registrable]} 공식 주소와 같습니다.` });
    return;
  }
  if (PLATFORMS.has(h.registrable)) return;

  const look = lookalike(h.registrable);
  if (look) out.signals.push({ level: 'signal', title: `${h.registrable} ${look.title}`, text: `${where}${look.name}의 공식 주소는 ${look.domain}입니다. 비슷하게 만든 다른 사이트일 수 있으니 로그인이나 입금을 하지 마세요.` });
  const tld = h.registrable.split('.').pop();
  if (RISKY_TLD.has(tld)) out.signals.push({ level: 'note', title: `${tag} 짧게 쓰고 버리는 사이트에 자주 쓰이는 주소입니다`, text: `.${tld} 주소는 값이 싸고 만들기 쉽습니다. 이것만으로 판단할 수는 없습니다.` });

  try {
    const info = await rdapLookup(h.registrable);
    const { years } = await hints;
    if (info.notFound) {
      out.signals.push({ level: 'note', title: `${h.registrable} 등록 정보가 나오지 않습니다`, text: '주소를 잘못 옮겨 적었거나 이미 없어진 사이트일 수 있습니다.' });
    } else if (info.created) {
      const created = new Date(info.created);
      const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
      if (years && days < years * 365 - 180) {
        out.signals.push({ level: 'signal', title: '운영기간 설명과 도메인 생성시점에 차이가 있습니다.', text: `상대는 ${years}년 운영했다고 했지만 ${h.registrable}은 ${ymd(created)}에 등록됐습니다. 약 ${ageText(days)} 전입니다.` });
      }
      if (days < 90) {
        out.signals.push({ level: 'signal', title: `${h.registrable} 만든 지 ${ageText(days)}밖에 안 된 주소입니다`, text: `${where}${ymd(created)}에 등록됐습니다. 만든 지 얼마 안 된 투자·쇼핑 사이트는 특히 확인이 필요합니다.` });
      } else if (days < 365) {
        out.signals.push({ level: 'note', title: `${h.registrable} 만든 지 ${ageText(days)} 된 주소입니다`, text: `${where}${ymd(created)}에 등록됐습니다. 오래된 곳이라고 했다면 말과 맞는지 확인해 보세요.` });
      } else {
        out.facts.push({ text: `${h.registrable}은 ${ymd(created)}에 등록된 주소로, 약 ${ageText(days)} 전부터 있었습니다.` });
      }
    } else {
      out.facts.push({ text: `${h.registrable} 주소는 등록 정보에 만든 날짜가 공개돼 있지 않아 운영 기간은 확인하지 못했습니다. 일부 해외 주소는 날짜를 공개하지 않습니다.` });
    }
  } catch {
    out.pending.push(busy('도메인 등록일', '도메인 등록 정보', `지금 바로 보려면 아래 ‘KISA 후이즈 검색’에 ${h.registrable} 주소를 넣어 직접 찾아볼 수 있어요.`));
    if (!out.links.includes(LINKS.whois)) out.links.push(LINKS.whois);
  }

  const exchangeLike = /(coin|bit|exchange|trade|swap|defi|finance|invest|token|usdt|crypto|chain|wallet)/.test(label(h.registrable));
  const { crypto } = await hints;
  if (crypto && !look && (fromChat || exchangeLike)) {
    out.signals.push({
      level: 'signal',
      title: `${h.registrable} 신고된 원화 거래소 주소가 아닙니다`,
      text: '업비트·빗썸·코인원·코빗·고팍스 주소가 아닙니다. 이곳에서 코인을 사라고 했다면 금융정보분석원 신고 명단에 있는지 확인하세요.',
      links: [LINKS.fiu],
    });
  }
}

// 대화 속 주소 가운데 사이트 주소만 — SNS·영상·블로그 주소는 확인하지 않는다
export const siteUrlsIn = (text) => extractUrls(text).filter((u) => !isSnsUrl(u));

export async function linkPart({ url, chat, hints = Promise.resolve({ years: null, crypto: false }) }) {
  const out = part();
  const raws = String(url || '').split(/[\s,]+/).filter((u) => u && !isSnsUrl(u));
  const fromChatSet = new Set(siteUrlsIn(chat));
  const seen = new Set();
  const hosts = [];
  for (const raw of [...raws, ...fromChatSet]) {
    const h = parseHost(raw);
    if (!h || seen.has(h.registrable)) continue;
    seen.add(h.registrable);
    hosts.push({ h, fromChat: !raws.includes(raw) });
    if (hosts.length >= 5) break;
  }
  await Promise.all(hosts.map(({ h, fromChat }) => hostPart(out, h, { hints, fromChat })));

  if (hosts.length) out.links.push(LINKS.boho);
  return out;
}


// ===================== 사업자 · 회사 · 직업 (5.5) =====================
export function bizChecksumOk(d) {
  if (!/^\d{10}$/.test(d)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}
const fmtBiz = (d) => d.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// 공공 조회 서버가 잠깐 응답하지 않을 때 — 무엇을 못 했는지와 지금 할 수 있는 일을 쉬운 말로(2026-10-26 오너: 모든 오류에 친절한 안내).
// retry: true 인 칸만 남은 항목은 화면에서 '다시 확인 필요'로 보인다(연동 준비 중과 구분)
export const busy = (label, who, how) => ({ label, retry: true, text: `${who} 서버가 지금 응답하지 않아 확인하지 못했어요. 잠시 뒤 다시 점검하면 확인할 수 있고, ${how}` });

// 연결이 끊기거나(네트워크 오류) 서버가 5xx 로 답하면 한 번 더 묻는다 — 정해 둔 시간 안에서만
async function fetchRetry(url, opts, ms) {
  const signal = AbortSignal.timeout(ms);
  for (let i = 0; ; i += 1) {
    let r;
    try {
      r = await fetch(url, { ...opts, signal });
    } catch (e) {
      if (signal.aborted || i >= 1) throw e;
      await pause(300);
      continue;
    }
    if (r.status >= 500 && i < 1) {
      await pause(300);
      continue;
    }
    return r;
  }
}

async function ntsStatus(d) {
  const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(process.env.DATA_GO_KR_KEY)}&returnType=JSON`;
  const t0 = Date.now();
  let r;
  try {
    r = await fetchRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ b_no: [d] }) }, 9000);
  } finally {
    recordApi('nts', { ok: Boolean(r?.ok), ms: Date.now() - t0 });
  }
  if (!r.ok) throw new Error(`nts ${r.status}`);
  return (await r.json())?.data?.[0] || null;
}

export async function bizPart(raw) {
  const out = part();
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return out;
  if (d.length !== 10) {
    out.signals.push({ level: 'note', title: '사업자등록번호는 숫자 10자리입니다', text: `입력한 번호는 ${d.length}자리입니다. 다시 확인해 주세요.` });
    return out;
  }
  if (!bizChecksumOk(d)) {
    out.signals.push({ level: 'signal', title: '사업자등록번호 규칙에 맞지 않는 번호입니다', text: `사업자등록번호 마지막 자리는 앞 숫자로 계산되는데 ${fmtBiz(d)}는 계산이 맞지 않습니다. 사업자등록증을 직접 보여 달라고 요청해 보세요.` });
    out.links.push(LINKS.hometax);
    return out;
  }
  out.facts.push({ text: `${fmtBiz(d)}는 사업자등록번호 계산 규칙에 맞는 번호입니다.` });
  if (!process.env.DATA_GO_KR_KEY) {
    out.pending.push({ label: '국세청 사업자등록정보 진위·상태조회', text: '공공데이터 키 연동 뒤 휴업·폐업 여부와 대표자·개업일 일치 여부를 자동으로 확인합니다.' });
    out.links.push({ ...LINKS.hometax, copy: fmtBiz(d) });
    return out;
  }
  try {
    const s = await ntsStatus(d);
    const stt = s?.b_stt || '';
    // 국세청 문구가 '…사업자등록번호입니다.'로 끝나 그대로 붙이면 '입니다'가 겹친다
    if (!stt && /등록되지 않은/.test(s?.tax_type || '')) out.signals.push({ level: 'signal', title: '국세청에 등록되지 않은 번호입니다', text: `국세청 조회에서 "${s.tax_type.replace(/입니다\.?\s*$/, '')}"로 나옵니다. 번호를 잘못 받았거나 없는 번호일 수 있으니 사업자등록증을 직접 보여 달라고 요청해 보세요.` });
    else if (/폐업/.test(stt)) out.signals.push({ level: 'signal', title: '폐업한 사업자입니다', text: `국세청 조회 결과 ${stt}${s.end_dt ? `, 폐업일 ${s.end_dt.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')}` : ''}. 지금 영업 중이라고 했다면 말과 다릅니다.` });
    else if (/휴업/.test(stt)) out.signals.push({ level: 'signal', title: '휴업 중인 사업자입니다', text: `국세청 조회 결과 ${stt}. 지금 영업 중이라고 했다면 말과 다릅니다.` });
    else if (stt) out.facts.push({ text: `국세청 조회 결과 ${stt}${s?.tax_type ? `, ${s.tax_type}` : ''}입니다. 사업자가 실제로 있다는 뜻이며, 상대가 이 회사 사람이라는 뜻은 아닙니다.` });
    else throw new Error('nts empty');
  } catch {
    out.pending.push(busy('국세청 사업자 상태조회', '국세청', '지금 바로 보려면 아래 ‘국세청 홈택스’에서 번호를 붙여 넣어 직접 조회해 보세요.'));
    out.links.push({ ...LINKS.hometax, copy: fmtBiz(d) });
  }
  return out;
}

// ===================== 공공데이터포털(공정위·금융위·심평원) — 2026-10-26 연결 =====================
// 키는 국세청 상태조회와 같은 DATA_GO_KR_KEY 하나(계정마다 키 하나, API 마다 활용신청만 따로).
// 조회한 번호·이름과 결과는 저장하지 않는다(store.mjs 는 호출 수·응답 시간만 센다).
const DATA_GO = {
  mail: 'https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3',
  door: 'https://apis.data.go.kr/1130000/ClslBs_2Service/getClslBsBiznoInfo_2',
  sponsor: 'https://apis.data.go.kr/1130000/SrlClslBs_2Service/getSrlClslBsBiznoInfo_2',
  mlm: 'https://apis.data.go.kr/1130000/MvlBs_2Service/getMvlBsInfo_2',
  mlmDetail: 'https://apis.data.go.kr/1130000/MvlBsDtl_2Service/getMvlBsDetail_2',
  corp: 'https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2',
  hosp: 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList',
};

async function dataGo(api, url, params, ms = 8000) {
  const q = new URLSearchParams({ serviceKey: process.env.DATA_GO_KR_KEY, pageNo: '1', resultType: 'json', _type: 'json', ...params });
  const t0 = Date.now();
  let ok = false;
  try {
    // 심평원은 관문 서버 몇 대가 옛 http 주소로 302 를 돌려준다(2026-10-26 실측, 키를 평문으로 실음).
    // 따라가지 않고, 302 는 0.1초 만에 오니 두 번까지 다시 묻는다. 연결 오류·5xx 도 한 번 더
    const signal = AbortSignal.timeout(ms);
    let r;
    for (let i = 0; i < 3; i += 1) {
      try {
        r = await fetch(`${url}?${q}`, { headers: { Accept: 'application/json' }, redirect: 'manual', signal });
      } catch (e) {
        if (signal.aborted || i === 2) throw e;
        await pause(300);
        continue;
      }
      if (r.status >= 300 && r.status < 400) continue;
      if (r.status >= 500 && i < 2) {
        await pause(300);
        continue;
      }
      break;
    }
    const text = await r.text();
    // 이 키로 활용신청이 안 된 API(아직 승인 전) — 이용자에게 '서버가 응답하지 않는다'고 하지 않고 그 조회만 조용히 뺀다
    if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_ACCESS_DENIED/.test(text)) throw Object.assign(new Error(`${api} unregistered`), { unregistered: true });
    if (!r.ok) throw new Error(`${api} ${r.status}`);
    // 키·한도 오류는 JSON 이 아니라 XML 로 온다
    const j = JSON.parse(text);
    const code = j.resultCode ?? j.response?.header?.resultCode;
    if (code && code !== '00') throw new Error(`${api} ${code}`);
    const body = j.response?.body ?? j;
    const items = [].concat(body.items?.item ?? body.items ?? []).filter((i) => i && typeof i === 'object');
    ok = true;
    return { total: Number(body.totalCount) || items.length, items };
  } finally {
    recordApi(api, { ok, ms: Date.now() - t0 });
  }
}

// 'N/A'·빈 값은 없는 것으로
const val = (s) => (s == null || /^(N\/A|-)?$/i.test(String(s).trim()) ? '' : String(s).trim());
// '20130821' → '2013.08.21' (위의 ymd 는 Date 용)
const ymd8 = (s) => val(s).replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1.$2.$3');
// 주소는 시·구까지만
const area = (addr) => val(addr).split(/\s+/).slice(0, 2).join(' ');
const hostsIn = (text) => [...String(text || '').matchAll(/(?:https?:\/+)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((m) => m[1].toLowerCase());
const BAD_STATE = /폐업|말소|취소|정지/;

// 방문판매·후원방문판매 등록(사업자번호) — 부업·회원 모집 권유 때 의미가 있다
function doorResult(out, res, kind, d) {
  if (res.status === 'rejected') return res.reason?.unregistered ? 'skip' : 'busy';
  if (!res.value.items.length) return 'none';
  const v = res.value.items.find((i) => /영업|정상/.test(val(i.bsnSttusNm))) || res.value.items[0];
  const stt = val(v.bsnSttusNm) || '상태 모름';
  const nm = val(v.conmNm) || val(v.corpNm);
  const since = ymd8(v.dclrDate) || ymd8(v.suprtClslPrmsnDate);
  if (BAD_STATE.test(stt)) out.signals.push({ level: 'note', title: `${kind} 등록이 ${stt} 상태입니다`, text: `공정위 자료에서 ${nm || fmtBiz(d)}의 ${kind} 등록은 ${stt} 상태입니다. 지금 회원 모집이나 판매를 권유하고 있다면 등록과 맞지 않습니다.` });
  else out.facts.push({ text: `${kind}으로 등록돼 있고 지금 ${stt}입니다. ${[nm && `상호 ${nm}`, since && `등록일 ${since}`].filter(Boolean).join(', ')}.` });
  return 'found';
}

// 다단계판매업 등록 — 공정위 자료는 회사 이름으로만 찾을 수 있다. 이름이 똑같은 곳만 남기고, 영업 상태는 상세 조회로
async function mlmLookup(name) {
  const n = companyName(name);
  if (nameKey(n).length < 2) return null;
  const r = await dataGo('ftc_mlm', DATA_GO.mlm, { numOfRows: '50', corpNm: n });
  const hit = r.items.find((i) => nameKey(i.corpNm) === nameKey(n));
  if (!hit) return { found: false, name: n };
  let state = '';
  try {
    const dt = await dataGo('ftc_mlm', DATA_GO.mlmDetail, { numOfRows: '1', opnSn: String(hit.opnSn) });
    state = val(dt.items[0]?.bsnSttusNm);
  } catch { /* 상태를 못 받아도 등록 사실은 보여 준다 */ }
  return { found: true, name: n, corp: val(hit.corpNm), since: ymd8(hit.prmsnDate), area: area(hit.rnAddr || hit.bzmnAddr), state };
}
function mlmFacts(out, m, { silentIfNone }) {
  if (!m) return;
  if (!m.found) {
    if (!silentIfNone) out.facts.push({ text: `공정위 다단계판매업자 명단에 이름이 "${m.name}"인 회사는 없습니다.` });
    return;
  }
  const bits = [m.since && `등록일 ${m.since}`, m.area && `${m.area}`, m.state && `지금 ${m.state}`].filter(Boolean).join(', ');
  if (m.state && BAD_STATE.test(m.state)) {
    out.signals.push({ level: 'signal', title: `다단계판매업 등록이 ${m.state} 상태입니다`, text: `공정위 다단계판매업자 명단에서 ${m.corp}의 등록은 지금 ${m.state} 상태입니다. 등록이 없는 상태에서 회원을 모집하거나 물건을 팔면 불법 다단계일 수 있습니다.` });
  } else {
    out.facts.push({ text: `공정위 다단계판매업자 명단에서 찾은 회사는 ${m.corp}입니다${bits ? `(${bits})` : ''}. 부업·회원 모집을 권유받았다면 후원수당과 반품 조건을 꼭 확인하세요.` });
  }
}

// 2026-10-26 쇼핑몰·사업체명 입력을 뺐다 — 공정위 자료는 사업자등록번호로만 찾는다
export async function commercePart(bizRaw, urlText = '') {
  const out = part();
  const d = String(bizRaw || '').replace(/\D/g, '');
  const okBiz = d.length === 10 && bizChecksumOk(d);
  if (!process.env.DATA_GO_KR_KEY) {
    out.pending.push(
      { label: '공정위 통신판매사업자', text: `연동 뒤 통신판매 신고와 영업상태를 확인합니다. 조회되지 않아도 곧바로 불법사업자로 보지 않습니다.` },
      { label: '공정위 방문판매·후원방문판매·다단계판매', text: '부업·회원모집·판매 권유가 있을 때 등록 여부만 사실로 표시합니다.' },
    );
    if (okBiz) out.links.push(ftcBizLink(d));
    return out;
  }
  if (okBiz) out.links.push(ftcBizLink(d));
  const [mail, door, sponsor] = await Promise.allSettled([
    okBiz ? dataGo('ftc_mail', DATA_GO.mail, { numOfRows: '10', brno: d }) : null,
    okBiz ? dataGo('ftc_door', DATA_GO.door, { numOfRows: '10', brno: d }) : null,
    okBiz ? dataGo('ftc_sponsor', DATA_GO.sponsor, { numOfRows: '10', brno: d }) : null,
  ]);
  const ftcHow = okBiz ? '지금 바로 보려면 아래 ‘공정위 사업자정보 공개 화면’에서 직접 확인해 보세요.' : '사업자등록번호를 알면 공정위 사업자정보 공개 화면에서 직접 확인할 수 있어요.';
  // 공정위가 응답하지 않은 조회는 모아서 한 줄로 알린다
  const down = [];

  // 통신판매업 신고 — 공정위 자료는 사업자등록번호로만 찾는다
  if (!okBiz) {
    out.facts.push({ tip: true, text: `사업자등록번호를 알면 통신판매업 신고와 방문판매업 등록도 자동으로 확인합니다. 쇼핑몰 맨 아래 '사업자정보확인'에서 번호를 찾을 수 있습니다.` });
  } else if (mail.status === 'rejected') {
    down.push('통신판매');
  } else if (!mail.value.items.length) {
    const t = '온라인으로 물건을 판다면 신고 대상이지만, 거래가 적은 사업자나 간이과세자는 신고가 면제될 수 있어 이것만으로 불법으로 보지 않습니다.';
    // 사이트 주소까지 받았으면 온라인 판매로 보고 '참고'로 짚는다
    if (hostsIn(urlText).length) out.signals.push({ level: 'note', title: '통신판매업 신고 내역이 없습니다', text: `공정위 통신판매사업자 자료에서 ${fmtBiz(d)}로 신고된 내역을 찾지 못했습니다. ${t}` });
    else out.facts.push({ text: `공정위 통신판매사업자 자료에 ${fmtBiz(d)}로 신고된 내역은 없습니다. ${t}` });
  } else {
    const list = mail.value.items;
    const m = list.find((i) => /정상/.test(val(i.operSttusCdNm))) || list[0];
    const stt = val(m.operSttusCdNm) || '상태 모름';
    const name = val(m.bzmnNm);
    const domains = [...new Set(hostsIn(m.domnCn))];
    const typed = hostsIn(urlText);
    const sameHost = typed.find((h) => domains.some((x) => x === h || x.endsWith(`.${h}`) || h.endsWith(`.${x}`)));
    if (/폐업|말소|취소/.test(stt)) {
      out.signals.push({ level: 'signal', title: `통신판매업 신고가 ${stt} 상태입니다`, text: `공정위 자료에서 ${name || fmtBiz(d)}의 통신판매업 신고는 ${stt}${ymd8(m.clsbizDate) ? `(${ymd8(m.clsbizDate)})` : ''} 상태입니다. 지금 온라인으로 판매한다고 했다면 신고와 맞지 않습니다.` });
    } else if (/휴업/.test(stt)) {
      out.signals.push({ level: 'note', title: '통신판매업 신고가 휴업 상태입니다', text: `공정위 자료에서 ${name || fmtBiz(d)}의 통신판매업 신고는 ${stt} 상태입니다. 지금 판매 중이라고 했다면 직접 확인해 보세요.` });
    } else {
      // 신고번호가 폰에서 '2026-' 뒤로 쪼개지지 않게 하이픈을 묶는다
      const bits = [name && `상호 ${name}`, val(m.prmmiMnno) && `신고번호 ${val(m.prmmiMnno).replace(/-/g, '\u2060-\u2060')}`, ymd8(m.dclrDate) && `신고일 ${ymd8(m.dclrDate)}`].filter(Boolean).join(', ');
      out.facts.push({ text: `공정위 통신판매사업자 자료에 신고가 있고 지금 ${stt}입니다. ${bits}.` });
    }
    if (domains.length) out.facts.push({ text: `신고한 쇼핑몰 주소는 ${domains.slice(0, 3).join(', ')}입니다.${sameHost ? ` 입력한 주소도 같은 곳(${sameHost})입니다.` : ' 상대가 보낸 쇼핑몰 주소와 같은지 직접 비교해 보세요.'}` });
  }

  // 방문판매·후원방문판매 등록 — 둘 다 없으면 한 줄로
  if (okBiz) {
    const a = doorResult(out, door, '방문판매업', d);
    const b = doorResult(out, sponsor, '후원방문판매업', d);
    const nones = [a === 'none' && '방문판매업', b === 'none' && '후원방문판매업'].filter(Boolean);
    if (nones.length) out.facts.push({ text: `${nones.join('·')} 등록은 없습니다. 부업이나 회원 모집을 권유받았다면 등록된 사업자인지 확인하는 것이 좋습니다.` });
    if (a === 'busy') down.push('방문판매');
    if (b === 'busy') down.push('후원방문판매');
  }

  if (down.length) {
    out.pending.push(busy(`공정위 ${down.join('·')} 등록`, '공정위', ftcHow));
  }
  return out;
}

// 금융위 기업기본정보 — 이름 일부만 같아도 나와서(‘삼성전자’ → ‘삼성전자잠실판매’) 같은 이름만 남기고, 법인등록번호마다 칸이 가장 많이 찬 기록 하나만
async function fscCorp(n) {
  const r = await dataGo('fsc_corp', DATA_GO.corp, { numOfRows: '500', corpNm: n });
  const best = new Map();
  for (const i of r.items) {
    if (nameKey(i.corpNm) !== nameKey(n)) continue;
    const filled = Object.values(i).filter((v) => val(v) && v !== '0').length;
    const prev = best.get(i.crno);
    if (!prev || filled > prev.filled) best.set(i.crno, { filled, i });
  }
  const similar = [...new Set(r.items.map((i) => val(i.corpNm)).filter((x) => x && nameKey(x) !== nameKey(n)))];
  return { exact: [...best.values()].map((b) => b.i), similar, total: r.total };
}

// 다니는 회사 이름만 받는다 — 운영하는 사업체 번호와는 다른 곳이라 사업자등록번호와 대조하지 않는다(2026-10-26 쇼핑몰·사업체명 입력 뺌)
export async function companyPart(name) {
  const out = part();
  const raw = String(name || '').trim();
  // '(주)브이글로벌'·'브이글로벌 다녀요' → '브이글로벌' (public/parse-input.js 규칙)
  const n = companyName(raw);
  if (n.length < 2) return out;
  out.links.push(LINKS.dart, naverSearch(`"${n}" 사기`, '네이버에서 회사 이름 검색'));
  if (!process.env.DATA_GO_KR_KEY) {
    out.pending.push({ label: '금융위 기업기본정보', text: '연동 뒤 기업명·대표자·설립일·업종을 공개정보와 대조합니다.' });
  } else {
    const [corp, mlm] = await Promise.allSettled([fscCorp(n), mlmLookup(n)]);
    if (corp.status === 'fulfilled') {
      const { exact, similar } = corp.value;
      const desc = (i) => [val(i.enpRprFnm) && `대표 ${val(i.enpRprFnm)}`, ymd8(i.enpEstbDt) && `설립 ${ymd8(i.enpEstbDt)}`, area(i.enpBsadr) && `본사 ${area(i.enpBsadr)}`].filter(Boolean).join(', ');
      if (!exact.length) {
        out.facts.push({ text: `금융위 기업기본정보에서 이름이 "${n}"인 법인을 찾지 못했습니다. 개인사업자나 작은 회사는 이 자료에 없을 수 있어 이것만으로 판단하지 않습니다.${similar.length ? ` 이름이 비슷한 법인으로는 ${similar.slice(0, 3).join(', ')} 등이 있습니다.` : ''}` });
      } else if (exact.length === 1) {
        const i = exact[0];
        out.facts.push({ text: `금융위 기업기본정보에서 찾은 법인은 ${val(i.corpNm)}입니다.${desc(i) ? ` ${desc(i)}.` : ''} 회사가 실제로 있다는 뜻이며, 상대가 이 회사 사람이라는 뜻은 아닙니다.` });
      } else {
        out.facts.push({ text: `금융위 기업기본정보에 "${n}" 이름의 법인이 ${exact.length}곳 있습니다. ${exact.slice(0, 3).map((i) => `${val(i.corpNm)}(${desc(i) || '세부 정보 없음'})`).join(', ')}. 상대가 말한 회사가 어느 곳인지 지역이나 대표 이름으로 확인해 보세요.` });
      }
    } else {
      out.pending.push(busy('금융위 기업기본정보', '금융위원회', '지금 바로 보려면 아래 ‘DART 전자공시 검색’에서 회사 이름으로 직접 찾아볼 수 있어요.'));
    }
    // 다단계판매업자로 등록된 회사면 알려 준다(없으면 굳이 적지 않는다). 조회가 안 돼도(승인 전 포함) 회사 확인과는 따로라 조용히 넘긴다
    if (mlm.status === 'fulfilled') mlmFacts(out, mlm.value, { silentIfNone: true });
  }
  // OpenDART 연동은 하지 않는다(2026-10-26 오너) — 회사 기본 정보는 금융위 자료와 겹치고, 임원 명단 대조는 이름을 받아야 해서 '이름 안 받기'와 부딪친다
  out.facts.push({ tip: true, text: `회사 이름과 사기·사칭이 함께 나온 뉴스는 네이버 버튼으로 직접 찾아보세요. 이 회사를 사칭한 사기를 알리는 글일 수도 있습니다.${n !== raw ? ` 입력한 "${raw}"에서 "${n}"만 떼어 찾습니다.` : ''}` });
  return out;
}

export const JOBS = ['회사원', '의사·치과의사·한의사', '간호사·약사', '군인', '사업가·자영업', '전문직', '해외 근무', '기타'];

// 심평원 병원 찾기 — 이름 일부로 찾는다. '서울아산병원 성형외과'처럼 진료과까지 쓰면 0곳이라 뒤 낱말을 하나씩 떼며(세 번까지) 다시 찾는다.
// API 가 안 되면 분기 목록(datasets/hira-list.json.gz)으로 같은 방식으로 찾는다. 약국은 API 에 없어 처음부터 목록으로.
export async function hiraFind(workplace, { pharmacy = false } = {}) {
  const words = companyName(workplace).split(/\s+/).filter(Boolean);
  const tries = [];
  for (let k = words.length; k >= Math.max(1, words.length - 2); k -= 1) {
    const q = words.slice(0, k).join(' ');
    if (q.replace(/\s/g, '').length >= 2) tries.push(q);
  }
  const whole = words.join(' ');
  if (!tries.length) return { q: whole, total: 0, items: [], src: 'api' };
  if (!pharmacy && process.env.DATA_GO_KR_KEY) {
    let failed = false;
    for (const q of tries) {
      let r;
      try {
        // 심평원은 응답이 1~10초로 들쭉날쭉해(2026-10-26 실측) 12초까지 기다린다
        r = await dataGo('hira', DATA_GO.hosp, { numOfRows: '30', yadmNm: q }, 12000);
      } catch {
        failed = true;
        break;
      }
      if (r.items.length) {
        const key = nameKey(q);
        const rank = (i) => (nameKey(i.yadmNm) === key ? 0 : nameKey(i.yadmNm).endsWith(key) ? 1 : 2);
        return { q, total: r.total, exact: r.items.filter((i) => rank(i) === 0).length, items: [...r.items].sort((a, b) => rank(a) - rank(b)).map((i) => ({ name: val(i.yadmNm), kind: val(i.clCdNm), area: area(i.addr), doctors: Number(i.drTotCnt) || 0 })), src: 'api' };
      }
    }
    if (!failed) return { q: whole, total: 0, items: [], src: 'api' };
  }
  // 목록으로 — 읽지 못하면(파일 없음 등) 실패로 넘긴다
  for (const q of tries) {
    const r = searchHiraList(q, { pharmacy });
    if (r.items.length) return { q, total: r.total, exact: r.exact, items: r.items, src: 'list', asOf: r.asOf };
  }
  return { q: whole, total: 0, items: [], src: 'list', asOf: searchHiraList('', { pharmacy }).asOf };
}

export async function jobPart(job, workplace) {
  const out = part();
  if (!job) return out;
  if (/의사|간호사|약사/.test(job)) {
    out.links.push(LINKS.hira);
    const w = String(workplace || '').trim();
    if (!w) {
      out.facts.push({ tip: true, text: '근무하는 병원이나 약국 이름을 알면 실제로 있는 곳인지 확인할 수 있습니다.' });
      return out;
    }
    const pharmacy = /약국/.test(w);
    const what = pharmacy ? '약국' : '병원';
    try {
      const { q, total, exact = 0, items, src, asOf } = await hiraFind(w, { pharmacy });
      // 실시간 조회가 안 돼 분기 목록으로 찾았으면 몇 월 기준인지 밝힌다
      const from = src === 'list' ? `심평원 ${what} 목록(${asOfText(asOf)} 기준)` : `심평원 ${what}정보`;
      const caveat = `${what}이 실제로 있다는 뜻이며, 상대가 이곳에서 일한다는 뜻은 아닙니다. 개인 면허는 확인하지 않습니다.`;
      const desc = (x) => [x.kind !== '약국' && x.kind, x.area, x.doctors > 0 && `의사 ${x.doctors}명`].filter(Boolean).join(', ');
      if (!items.length) {
        out.signals.push({ level: 'note', title: `말한 ${what}을 찾지 못했습니다`, text: `${from}에서 "${w}" 이름의 ${what}을 찾지 못했습니다. 이름을 줄이거나 다르게 말했을 수 있고, 해외 ${what}은 이 목록에 없습니다.${src === 'list' ? ' 목록이 만들어진 뒤 새로 문을 연 곳일 수도 있습니다.' : ''} 아래 심평원 화면에서 다른 이름으로도 찾아보세요.` });
      } else if (exact > 1) {
        // '온누리약국'처럼 이름이 똑같은 곳이 여럿이면 한 곳을 내세우지 않는다
        out.facts.push({ text: `${from}에 이름이 "${items[0].name}"인 ${what}이 ${exact}곳 있습니다. ${items.slice(0, 3).map((x) => x.area).filter(Boolean).join(', ')}${exact > 3 ? ' 등' : ''}. 상대가 말한 곳이 어느 지역인지 확인해 보세요. ${caveat}` });
      } else if (total === 1 || exact === 1) {
        // 한 곳뿐이거나 이름이 똑같은 곳이 하나일 때만 '찾은 곳'으로. '아산병원'처럼 여러 곳이 걸리면 강릉아산병원을 내세우지 않고 목록으로
        out.facts.push({ text: `${from}에서 찾은 ${what}은 ${items[0].name}입니다(${desc(items[0])}). ${caveat}` });
        if (total > 1) out.facts.push({ text: `"${q}" 이름이 들어간 ${what}이 이 밖에도 ${total - 1}곳 더 있습니다. 상대가 말한 곳이 어디인지 지역까지 확인해 보세요.` });
      } else {
        out.facts.push({ text: `${from}에 "${q}" 이름이 들어간 ${what}이 ${total}곳 있습니다. ${items.slice(0, 4).map((x) => `${x.name}(${x.area})`).join(', ')}${total > 4 ? ' 등' : ''}. 상대가 말한 곳이 어디인지 지역까지 확인해 보세요. ${caveat}` });
      }
    } catch {
      out.pending.push(busy(`심평원 ${what}정보`, '심평원', `지금 바로 보려면 아래 ‘심평원 병원 찾기’에서 ${what} 이름으로 직접 찾아볼 수 있어요.`));
    }
  } else if (job === '군인' || job === '해외 근무') {
    out.signals.push({ level: 'note', title: `${job} 설정은 로맨스스캠에서 자주 쓰입니다`, text: '해외 파병·해외 현장 근무는 만날 수 없는 이유와 돈이 필요한 이유를 함께 만들기 쉬운 설정입니다. 이것만으로 판단할 수는 없습니다.' });
  } else if (job === '사업가·자영업') {
    out.facts.push({ tip: true, text: '사업자등록번호나 상호를 알면 사업자 진위·상태와 신고 여부를 확인할 수 있습니다.' });
  } else {
    out.facts.push({ tip: true, text: '이 직업은 공개 정보로 직접 확인할 방법이 없습니다. 회사 이름을 알면 회사 공개정보를 확인할 수 있습니다.' });
  }
  return out;
}
