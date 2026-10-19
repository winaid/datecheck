// 공식 데이터·공개 자료 확인 — 기획서 4장 표와 5.1·5.4·5.5
// 각 함수는 항목 조각 { signals, facts, pending, links } 를 돌려준다.
import { naverReady, findMentions, joinDigitGroups, FRAUD_WORDS, toSource } from './naver.mjs';
import { recordApi } from './store.mjs';
import { LINKS, ftcBizLink } from './links.mjs';

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
  if (/^01[016789]\d{7,8}$/.test(d)) return { kind: 'mobile', digits: d, display: d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^070\d{8}$/.test(d)) return { kind: 'internet', digits: d, display: d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3') };
  if (/^050\d{8,9}$/.test(d)) return { kind: 'virtual', digits: d, display: d.replace(/^(\d{4})(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^02\d{7,8}$/.test(d)) return { kind: 'landline', digits: d, display: d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^0[3-6]\d\d{7,8}$/.test(d)) return { kind: 'landline', digits: d, display: d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') };
  if (/^1[5-9]\d{6}$/.test(d)) return { kind: 'rep', digits: d, display: d.replace(/^(\d{4})(\d{4})$/, '$1-$2') };
  return { kind: 'invalid', digits: d, display: s };
}

const THECHEAT_PENDING = {
  label: '더치트 API',
  text: '제휴 계약 뒤 최근 피해등록 여부를 자동으로 조회합니다. 등록이 확인되면 "최근 피해등록 정보가 확인되었습니다. 추가 확인을 권장합니다."로 알려 드립니다.',
};

async function mentionPart(out, { what, digits, queries, name }) {
  if (!naverReady()) {
    out.pending.push({ label: '공개 웹 언급', text: '검색 API 키를 넣으면 공개 글에서 이 번호가 나온 곳을 찾습니다.' });
    return;
  }
  const res = await findMentions(queries, ['web', 'blog', 'cafe', 'kin'], (it) => joinDigitGroups(`${it.title} ${it.text}`).includes(digits));
  if (res.failed === res.total) {
    out.pending.push({ label: '공개 웹 언급', text: '검색이 잠시 응답하지 않았습니다. 잠시 뒤 다시 확인해 주세요.' });
    return;
  }
  const fraud = res.items.filter((it) => FRAUD_WORDS.test(`${it.title} ${it.text}`));
  const nameHits = name ? res.items.filter((it) => `${it.title} ${it.text}`.includes(name)).length : 0;
  const nameLine = nameHits ? ` 그중 ${nameHits}건에는 알려 준 이름도 함께 나옵니다.` : '';
  if (fraud.length) {
    out.signals.push({
      level: 'signal',
      title: `피해 관련 공개 글 ${fraud.length}건에서 ${what}가 확인되었습니다`,
      text: `공개 웹에서 사기·피해를 이야기하는 글에 ${what}가 나옵니다.${nameLine} 예전에 다른 사람이 쓰던 번호일 수도 있으니 날짜와 내용을 직접 확인하는 것을 권장합니다.`,
      sources: fraud.slice(0, 5).map(toSource),
    });
  } else if (res.items.length) {
    out.facts.push({ text: `공개 글 ${res.items.length}건에 ${what}가 나오지만 사기·피해 관련 글은 없습니다.${nameLine}`, sources: res.items.slice(0, 3).map(toSource) });
  } else {
    out.facts.push({ text: `공개 웹 문서·블로그·카페·지식iN에서 ${what}가 나온 글은 없습니다.` });
  }
}

export async function phonePart(raw, name) {
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
  await mentionPart(out, { what: '이 번호', digits: p.digits, queries: [p.display, p.digits], name });
  out.pending.push(THECHEAT_PENDING);
  out.links.push({ ...LINKS.police, copy: p.display }, LINKS.thecheat);
  return out;
}

export async function accountPart(raw, bank, name) {
  const out = part();
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return out;
  if (digits.length < 8) {
    out.signals.push({ level: 'note', title: '계좌번호가 너무 짧습니다', text: '계좌번호는 보통 10~14자리입니다. 다시 확인해 주세요.' });
    return out;
  }
  if (bank) out.facts.push({ text: `${bank} 계좌로 입력했습니다.` });
  await mentionPart(out, { what: '이 계좌번호', digits, queries: [digits], name });
  out.pending.push(THECHEAT_PENDING);
  out.links.push({ ...LINKS.police, copy: digits }, LINKS.thecheat);
  return out;
}

// ===================== URL · 도메인 · SNS (5.4) =====================
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
const SNS = new Set(['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com', 'linkedin.com', 'threads.net']);
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

export function claimedYears(text) {
  const m = String(text || '').match(/(\d{1,2})\s*년\s*(째|차|동안|간|전부터|운영|됐|되었|넘|이상|경력|정도\s*(운영|했))/);
  return m ? Number(m[1]) : null;
}

async function hostPart(out, h, { years, crypto, fromChat }) {
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
      out.pending.push({ label: '도메인 등록일', text: `${h.registrable}은 등록 정보에 날짜가 공개돼 있지 않습니다.` });
    }
  } catch {
    out.pending.push({ label: '도메인 등록일', text: `${h.registrable} 등록 정보 서버가 응답하지 않았습니다. 잠시 뒤 다시 확인해 주세요.` });
  }

  const exchangeLike = /(coin|bit|exchange|trade|swap|defi|finance|invest|token|usdt|crypto|chain|wallet)/.test(label(h.registrable));
  if (crypto && !look && (fromChat || exchangeLike)) {
    out.signals.push({
      level: 'signal',
      title: `${h.registrable} 신고된 원화 거래소 주소가 아닙니다`,
      text: '업비트·빗썸·코인원·코빗·고팍스 주소가 아닙니다. 이곳에서 코인을 사라고 했다면 금융정보분석원 신고 명단에 있는지 확인하세요.',
      links: [LINKS.fiu],
    });
  }
}

export async function linkPart({ url, sns, chat, claims }) {
  const out = part();
  const raws = String(url || '').split(/[\s,]+/).filter(Boolean);
  const fromChatSet = new Set(extractUrls(chat));
  const seen = new Set();
  const hosts = [];
  for (const raw of [...raws, ...fromChatSet]) {
    const h = parseHost(raw);
    if (!h || seen.has(h.registrable)) continue;
    seen.add(h.registrable);
    hosts.push({ h, fromChat: !raws.includes(raw) });
    if (hosts.length >= 5) break;
  }
  const years = claimedYears(claims);
  const crypto = /(코인|거래소|USDT|테더|비트\s*코인|이더리움|가상\s*자산|선물\s*거래)/i.test(`${chat} ${claims}`);
  await Promise.all(hosts.map(({ h, fromChat }) => hostPart(out, h, { years, crypto, fromChat })));

  // SNS 계정 — 아이디가 사기·피해 글에 나오는지
  const handle = snsHandle(sns);
  if (handle) {
    if (naverReady()) {
      const res = await findMentions([handle], ['web', 'blog', 'cafe'], (it) => `${it.title} ${it.text}`.toLowerCase().includes(handle.toLowerCase()) && FRAUD_WORDS.test(`${it.title} ${it.text}`));
      if (res.items.length) {
        out.signals.push({ level: 'signal', title: `SNS 아이디가 피해 관련 공개 글 ${res.items.length}건에 나옵니다`, text: '같은 아이디를 쓰는 다른 계정일 수도 있으니 내용을 직접 확인하세요.', sources: res.items.slice(0, 5).map(toSource) });
      } else if (res.failed < res.total) {
        out.facts.push({ text: `SNS 아이디 ${handle}가 사기·피해 관련 공개 글에 나온 기록은 없습니다.` });
      }
    }
    out.facts.push({ text: '계정을 만든 시기, 게시물이 한꺼번에 올라왔는지, 친구·팔로워가 실제 사람인지 직접 살펴보세요.' });
  }
  if (hosts.length || handle) out.links.push(LINKS.boho);
  return out;
}

export function snsHandle(sns) {
  const s = String(sns || '').trim();
  if (!s) return '';
  const h = parseHost(s);
  if (h && SNS.has(h.registrable)) {
    const seg = h.path.split('/').filter(Boolean)[0] || '';
    return seg.replace(/^@/, '');
  }
  return s.replace(/^@/, '').split(/[\s/]/)[0];
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

async function ntsStatus(d) {
  const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(process.env.DATA_GO_KR_KEY)}&returnType=JSON`;
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ b_no: [d] }), signal: AbortSignal.timeout(8000) });
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
    if (!stt && /등록되지 않은/.test(s?.tax_type || '')) out.signals.push({ level: 'signal', title: '국세청에 등록되지 않은 번호입니다', text: `국세청 조회 결과 "${s.tax_type}" 입니다.` });
    else if (/폐업/.test(stt)) out.signals.push({ level: 'signal', title: '폐업한 사업자입니다', text: `국세청 조회 결과 ${stt}${s.end_dt ? `, 폐업일 ${s.end_dt.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')}` : ''}. 지금 영업 중이라고 했다면 말과 다릅니다.` });
    else if (/휴업/.test(stt)) out.signals.push({ level: 'signal', title: '휴업 중인 사업자입니다', text: `국세청 조회 결과 ${stt}. 지금 영업 중이라고 했다면 말과 다릅니다.` });
    else out.facts.push({ text: `국세청 조회 결과 ${stt}${s?.tax_type ? `, ${s.tax_type}` : ''}입니다. 사업자가 실제로 있다는 뜻이며, 상대가 이 회사 사람이라는 뜻은 아닙니다.` });
  } catch {
    out.pending.push({ label: '국세청 사업자등록정보 진위·상태조회', text: '조회가 잠시 응답하지 않았습니다.' });
  }
  return out;
}

export function commercePart(bizRaw, shop) {
  const out = part();
  const d = String(bizRaw || '').replace(/\D/g, '');
  out.pending.push(
    { label: '공정위 통신판매사업자', text: '연동 뒤 통신판매 신고와 영업상태를 확인합니다. 조회되지 않아도 곧바로 불법사업자로 보지 않습니다.' },
    { label: '공정위 방문판매·후원방문판매', text: '부업·회원모집·판매 권유가 있을 때 등록 여부만 사실로 표시합니다.' },
    { label: '행안부 다단계판매업체 인허가', text: '검색 결과를 사기 여부로 해석하지 않고 인허가·영업상태만 보여 드립니다.' },
  );
  if (d.length === 10 && bizChecksumOk(d)) out.links.push(ftcBizLink(d));
  if (shop) out.facts.push({ text: `입력한 상호 "${shop}"로 연동 뒤 신고 여부를 조회합니다.` });
  return out;
}

export async function companyPart(name) {
  const out = part();
  const n = String(name || '').trim();
  if (n.length < 2) return out;
  out.pending.push(
    { label: '금융위 기업기본정보', text: '연동 뒤 기업명·대표자·설립일·업종을 공개정보와 대조합니다.' },
    { label: 'OpenDART', text: '연동 뒤 회사개황과 임원 공시를 대조합니다. DART에 없다고 직원이 아니라고 판단하지 않습니다.' },
  );
  out.links.push(LINKS.dart);
  if (!naverReady()) return out;
  const compact = (s) => s.replace(/\s+/g, '');
  const target = compact(n);
  const IMPERSONATION = /(사칭|도용|가짜\s*(문자|사이트|직원|채용))/;
  const res = await findMentions([`${n} 사기`, `${n} 피해`], ['news', 'blog', 'cafe'], (it) => compact(it.title).includes(target) && FRAUD_WORDS.test(it.title));
  if (res.failed === res.total) return out;
  const newsFirst = (list) => [...list.filter((it) => it.kind === 'news'), ...list.filter((it) => it.kind !== 'news')];
  const imp = res.items.filter((it) => IMPERSONATION.test(it.title));
  const direct = res.items.filter((it) => !IMPERSONATION.test(it.title));
  if (direct.length) {
    out.signals.push({ level: 'note', title: `제목에 회사 이름과 사기·피해가 함께 나온 글이 ${direct.length}건 있습니다`, text: '이 회사가 피해를 입은 쪽이거나 같은 이름의 다른 회사일 수도 있습니다. 제목과 날짜를 직접 확인하세요.', sources: newsFirst(direct).slice(0, 5).map(toSource) });
  }
  if (imp.length) {
    out.signals.push({ level: 'note', title: `이 회사를 사칭한 사기를 알리는 글이 ${imp.length}건 있습니다`, text: '상대가 이 회사 사람이라고 했다면 회사 대표번호로 직접 확인해 보세요.', sources: newsFirst(imp).slice(0, 5).map(toSource) });
  }
  if (!direct.length && !imp.length) out.facts.push({ text: '뉴스·블로그·카페 제목에서 회사 이름과 사기·피해가 함께 나온 글은 없습니다.' });
  return out;
}

export const JOBS = ['회사원', '의사·치과의사·한의사', '간호사·약사', '군인', '사업가·자영업', '전문직', '해외 근무', '기타'];

export function jobPart(job, workplace) {
  const out = part();
  if (!job) return out;
  if (/의사|간호사|약사/.test(job)) {
    out.pending.push({ label: '심평원 병원정보', text: `연동 뒤 ${workplace ? `"${workplace}"` : '근무처'}가 실제로 있는 병원인지 확인합니다. 병원 존재 확인이며 개인 면허 확인은 아닙니다.` });
    out.links.push(LINKS.hira);
    if (!workplace) out.facts.push({ text: '근무하는 병원 이름을 알면 실제로 있는 곳인지 확인할 수 있습니다.' });
  } else if (job === '군인' || job === '해외 근무') {
    out.signals.push({ level: 'note', title: `${job} 설정은 로맨스스캠에서 자주 쓰입니다`, text: '해외 파병·해외 현장 근무는 만날 수 없는 이유와 돈이 필요한 이유를 함께 만들기 쉬운 설정입니다. 이것만으로 판단할 수는 없습니다.' });
  } else if (job === '사업가·자영업') {
    out.facts.push({ text: '사업자등록번호나 상호를 알면 사업자 진위·상태와 신고 여부를 확인할 수 있습니다.' });
  } else {
    out.facts.push({ text: '이 직업은 공개 정보로 직접 확인할 방법이 없습니다. 회사 이름을 알면 회사 공개정보를 확인할 수 있습니다.' });
  }
  return out;
}
