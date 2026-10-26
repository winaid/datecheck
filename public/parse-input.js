// 이용자가 적은 입력을 찾을 수 있는 모양으로 바꾼다 — 화면(입력 칸 아래 안내)과 서버(lib/)가 같은 규칙을 쓰도록 이 파일 하나만 둔다.

// ===================== SNS·영상·블로그 주소 가려내기 =====================
// 2026-10-26 오너: SNS 계정은 받지 않는다 — 이름처럼 특정한 사람을 가리키는 정보라 사람 찾기로 보일 수 있다.
// 링크 칸이나 대화에 섞여 와도 확인하지 않고 걸러 낸다. 이런 큰 사이트는 도메인 등록일로 알 수 있는 것도 없다.
const SNS_HOSTS = [/(^|\.)instagram\.com$/, /(^|\.)instagr\.am$/, /(^|\.)threads\.(net|com)$/, /(^|\.)(facebook|fb)\.com$/, /(^|\.)(x|twitter)\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)linkedin\.com$/, /(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/, /^blog\.naver\.com$/, /^open\.kakao\.com$/, /^story\.kakao\.com$/, /(^|\.)band\.us$/];
export function isSnsUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  try {
    const host = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^(www|m)\./, '');
    return SNS_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

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
