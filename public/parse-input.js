// 이용자가 적은 SNS·회사 입력을 검색할 수 있는 모양으로 바꾼다.
// 화면(입력 칸 아래 안내)과 서버(lib/sources.mjs 검색)가 같은 규칙을 쓰도록 이 파일 하나만 둔다.

// ===================== SNS =====================
// 주소 첫 칸이 아이디가 아닌 경우 — p·reel 은 게시물, stories 는 다음 칸이 아이디
const SITES = [
  [/(^|\.)instagram\.com$|(^|\.)instagr\.am$/, 'instagram', '인스타그램'],
  [/(^|\.)threads\.(net|com)$/, 'threads', '스레드'],
  [/(^|\.)(facebook|fb)\.com$/, 'facebook', '페이스북'],
  [/(^|\.)(x|twitter)\.com$/, 'x', 'X'],
  [/(^|\.)tiktok\.com$/, 'tiktok', '틱톡'],
  [/(^|\.)linkedin\.com$/, 'linkedin', '링크드인'],
  [/(^|\.)youtube\.com$/, 'youtube', '유튜브'],
  [/^(m\.)?blog\.naver\.com$/, 'naver-blog', '네이버 블로그'],
  [/^open\.kakao\.com$/, 'kakao-open', '카카오톡 오픈채팅'],
];
const POST_SEG = new Set(['p', 'reel', 'reels', 'tv', 'share', 'watch', 'shorts', 'video', 'photo', 'photo.php', 'story.php', 'permalink.php', 'groups', 'events', 'posts', 'status', 't', 'v']);
const PAGE_SEG = new Set(['explore', 'accounts', 'direct', 'about', 'legal', 'home', 'search', 'i', 'intent', 'hashtag', 'login', 'settings']);
const NEXT_SEG = new Set(['stories', 'in', 'pub', 'company', 'channel', 'c', 'user', 'o', 'people']);
// 글로 적은 경우 아이디가 아닌 말
const WORD_SITE = [
  [/인스타|instagram|insta\b|\big\b/i, 'instagram', '인스타그램'],
  [/스레드|threads/i, 'threads', '스레드'],
  [/페북|페이스북|facebook|\bfb\b/i, 'facebook', '페이스북'],
  [/틱톡|tiktok/i, 'tiktok', '틱톡'],
  [/트위터|twitter/i, 'x', 'X'],
  [/카톡|카카오/i, 'kakao', '카카오톡'],
  [/텔레그램|telegram/i, 'telegram', '텔레그램'],
  [/라인\b|\bline\b/i, 'line', '라인'],
];
const NOT_ID = /^(instagram|insta|ig|id|threads|facebook|fb|tiktok|twitter|kakao|kakaotalk|telegram|line|dm|sns|http|https|www|com)$/i;
const ID_OK = /^[A-Za-z0-9._-]{1,40}$/;

const clean = (s) => String(s || '').trim().replace(/^@+/, '').replace(/[.,;:!?)\]]+$/, '');

function fromUrl(raw) {
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\.(?!blog)/, '');
  if (!host.includes('.')) return null;
  const site = SITES.find(([re]) => re.test(host));
  if (!site) return { id: '', why: 'site', url: raw };
  const [, key, name] = site;
  let segs = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  // 로그인 화면으로 넘어간 주소: /accounts/login/?next=/아이디/
  if (segs[0] === 'accounts' && u.searchParams.get('next')) segs = u.searchParams.get('next').split('/').filter(Boolean);
  if (key === 'facebook' && /profile\.php/.test(u.pathname)) return pick(u.searchParams.get('id') || '', key, name);
  if (key === 'naver-blog' && /PostView/i.test(u.pathname)) return pick(u.searchParams.get('blogId') || '', key, name);
  let seg = segs[0] || '';
  if (NEXT_SEG.has(seg.toLowerCase())) seg = key === 'facebook' ? segs[segs.length - 1] || '' : segs[1] || '';
  else if (POST_SEG.has(seg.toLowerCase())) return { id: '', why: 'post', site: key, siteName: name };
  else if (PAGE_SEG.has(seg.toLowerCase()) || !seg) return { id: '', why: 'page', site: key, siteName: name };
  return pick(seg, key, name);
}

function pick(seg, site, siteName) {
  const id = clean(seg);
  if (!id) return { id: '', why: 'page', site, siteName };
  if (!ID_OK.test(id)) return { id: '', why: 'nickname', site, siteName };
  if (id.length < 3) return { id: '', why: 'short', site, siteName };
  return { id, site, siteName };
}

// 'instagram.com/아이디', '@아이디', '인스타 아이디', 게시물 주소 등 → { id, site, siteName, why }
//   why: post(게시물 주소) · page(아이디 없는 화면) · site(SNS 아닌 사이트) · nickname(한글 별명) · short(너무 짧음)
export function parseSns(raw) {
  const s = String(raw || '').trim();
  if (!s) return { id: '', why: 'empty' };
  const url = s.match(/(https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*)/i);
  if (url) {
    const r = fromUrl(url[0]);
    if (r) return r;
  }
  const word = WORD_SITE.find(([re]) => re.test(s));
  const [, site = '', siteName = ''] = word || [];
  const tokens = s.match(/@?[A-Za-z0-9._-]+/g) || [];
  const at = tokens.find((t) => t.startsWith('@') && !NOT_ID.test(clean(t)));
  const plain = tokens.map(clean).filter((t) => t && !NOT_ID.test(t) && /[A-Za-z0-9]/.test(t) && !/\.(com|net|am|kr)$/i.test(t));
  const id = clean(at || '') || plain[0] || '';
  if (!id) return { id: '', why: /[가-힣]/.test(s) ? 'nickname' : 'short', site, siteName };
  return pick(id, site, siteName);
}

// 흔한 낱말 같은 짧은 아이디(love·minji)는 다른 글과 섞이기 쉽다
export const distinctId = (id) => /[\d._-]/.test(id) || id.length >= 8;

// 글 안에 아이디가 '따로 떨어진 낱말'로 있는지 — kim 이 kimchi 안에서 잡히지 않게
export function idInText(id, text) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^A-Za-z0-9._])@?${esc}(?![A-Za-z0-9_]|\\.[A-Za-z0-9])`, 'i');
  if (!re.test(text)) return false;
  return distinctId(id) || new RegExp(`@${esc}|instagram|인스타|아이디|계정|팔로|디엠|\\bDM\\b|틱톡|스레드|페북|페이스북|트위터|오픈채팅`, 'i').test(text);
}

export const SNS_WHY = {
  post: '게시물 주소에는 아이디가 들어 있지 않습니다. 프로필 주소나 @아이디를 넣어 주세요.',
  page: '이 주소에서는 아이디를 찾지 못했습니다. 프로필 주소나 @아이디를 넣어 주세요.',
  site: 'SNS 주소가 아닙니다. 이 주소는 사이트 등록 정보로 확인합니다.',
  nickname: '한글 이름·별명은 다른 사람과 겹쳐서 찾지 않습니다. 영문 아이디를 넣어 주세요.',
  short: '아이디가 너무 짧아 다른 글과 섞입니다. 세 글자 이상인 아이디를 넣어 주세요.',
};

// ===================== 회사 =====================
const LEGAL = /\(\s*(주|유|사|재|합)\s*\)|주식회사|유한책임회사|유한회사|합자회사|합명회사|사단법인|재단법인|농업회사법인|영농조합법인|협동조합/g;
const LEGAL_EN = /(^|\s|,)(co\.?,?\s*ltd\.?|inc\.?|corp\.?|corporation|ltd\.?|llc)(?=\s|,|$)/gi;
// 회사 이름 뒤에 붙여 쓴 말: '브이글로벌 다녀요', '삼성전자에서 일한대요'
const TAIL = /^(다녀|다닌|다님|다니|근무|재직|일해|일한|일함|일하|직원|소속|대표|사장|회장|이사|부장|차장|과장|팀장|대리|사원|했어|한대|이래|래요|이라|라고|이에요|예요|입니다)/;

export function stripLegal(s) {
  return String(s || '').normalize('NFKC').replace(LEGAL, ' ').replace(LEGAL_EN, ' ');
}

// 이름 비교용 — 법인 표시·띄어쓰기·문장부호·대소문자를 뺀다('(주)카카오' = '카카오' = '주식회사 카카오')
export function nameKey(s) {
  return stripLegal(s).replace(/[\s·.,'"“”‘’()]/g, '').toLowerCase();
}

// '(주)브이글로벌', '주식회사 브이글로벌', '㈜브이글로벌', '브이글로벌 다녀요' → '브이글로벌'
export function companyName(raw) {
  const words = stripLegal(raw).replace(/[,·]/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && TAIL.test(words[words.length - 1])) words.pop();
  if (words.length) words[words.length - 1] = words[words.length - 1].replace(/(에서|이라고|라고|이래요|래요|이에요|예요)$/, '');
  return words.join(' ').replace(/^[\s'"“”‘’]+|[\s'"“”‘’.]+$/g, '');
}

// 글 제목에 회사 이름이 '그 회사'로 나오는지 — '카카오' 가 '카카오톡·카카오페이' 안에서 잡히지 않게
const AFTER = '은|는|이|가|을|를|의|에|와|과|도|만|로|으로|측|발|관련|사기|피해|사칭|먹튀|고소|폰지|다단계|대표|직원|회장|사태|사건|투자|코인|그룹';
export function nameInTitle(name, title) {
  const chars = [...name.replace(/\s+/g, '')].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!chars.length) return false;
  const re = new RegExp(`(?<![가-힣A-Za-z0-9])${chars.join('\\s*')}(?=$|[^가-힣A-Za-z0-9]|${AFTER})`, 'iu');
  return re.test(stripLegal(title));
}
