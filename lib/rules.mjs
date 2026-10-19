// 대화 속 사기 흐름 찾기 — 규칙 기반(비용 0). AI 분석은 오너 승인 뒤 붙인다.
// 한 갈래가 여러 번 걸려도 신호는 1건으로 센다. 사람을 점수 매기지 않는다.

const ALL = ['date', 'collab', 'invest', 'sidejob', 'trade', 'hire'];

export const PATTERNS = [
  {
    key: 'money_request',
    // 개인 간 거래는 입금 이야기가 당연히 나오므로 뺀다
    modes: ['date', 'collab', 'invest', 'sidejob', 'hire'],
    title: '돈을 보내 달라는 말이 있어요',
    why: '아직 만나지 않았거나 알게 된 지 얼마 안 된 사이에서 돈 이야기가 나오면 가장 흔한 사기 단계예요. 이유가 아무리 딱해도 보내기 전에 확인부터 하세요.',
    res: [
      /(돈|금액|비용|생활비|병원비|수술비|치료비|항공권|비행기\s*표|월세|급전)[^.\n?!]{0,15}(보내|빌려|부쳐|입금|송금|이체)/,
      /(빌려\s*(줄\s*수|줄래|줘|달라)|송금\s*(해|좀|부탁)|입금\s*(해|좀|부탁)|이체\s*(해|좀|부탁))/,
    ],
  },
  {
    key: 'fee_first',
    modes: ALL,
    title: '돈을 받으려면 먼저 내야 한다는 말이 있어요',
    why: '"수익을 찾으려면 수수료부터", "물건을 받으려면 통관비부터" 처럼 먼저 돈을 내게 하는 건 투자·부업·택배 사기에 공통으로 나오는 흐름이에요.',
    res: [
      /(수수료|세금|통관비|관세|보증\s*보험료?|인증비|등록비|가입비|활성화\s*비용|출금\s*수수료|해제\s*비용|선입금|예치금)[^.\n?!]{0,20}(먼저|부터|내야|입금|보내|납부|결제)/,
      /(먼저|우선)[^.\n?!]{0,10}(수수료|세금|선입금|예치금)/,
    ],
  },
  {
    key: 'gift_card',
    modes: ALL,
    title: '상품권·코인으로 달라는 말이 있어요',
    why: '상품권 핀번호나 코인은 보내면 되돌리기 어려워서 사기에 자주 쓰여요. 정상적인 거래나 회사는 이렇게 받지 않아요.',
    res: [
      /(상품권|기프트\s*카드|구글\s*플레이\s*카드|문화\s*상품권|컬쳐\s*랜드|해피\s*머니|기프티콘|USDT|테더)[^.\n?!]{0,20}(보내|사서|구매|핀|번호|충전)/i,
    ],
  },
  {
    key: 'guaranteed_return',
    modes: ALL,
    title: '수익을 보장한다는 말이 있어요',
    why: '원금이나 수익을 보장하는 투자는 법으로도 함부로 약속할 수 없어요. "무조건 오른다", "내부 정보" 같은 말은 투자 사기의 대표적인 미끼예요.',
    res: [
      /(원금\s*보장|수익\s*보장|확정\s*수익|손실\s*(없|0)|손해\s*(안\s*봐|볼\s*일\s*없|없))/,
      /(무조건|100\s*%)\s*(수익|오르|올라|벌)/,
      /(하루|매일|1일)\s*\d+(\.\d+)?\s*%|월\s*\d+(\.\d+)?\s*%\s*(수익|이자|배당)/,
      /(내부\s*정보|작전\s*주|세력\s*(이|들)|상장\s*(예정|전에)|몇\s*배\s*(오를|뛸|벌))/,
    ],
  },
  {
    key: 'invest_in_romance',
    modes: ['date'],
    title: '연애 대화에 투자 이야기가 나와요',
    why: '친해진 뒤 코인·주식·투자 사이트를 권하는 건 로맨스스캠에서 가장 많이 보이는 흐름이에요. 상대가 "나도 여기서 벌었다"고 해도 직접 확인할 방법이 없어요.',
    res: [
      /(투자|코인|비트\s*코인|이더리움|선물\s*거래|거래소|리딩|수익률|차트|레버리지|마진|해외\s*주식|금\s*투자)/,
    ],
  },
  {
    key: 'platform_move',
    modes: ALL,
    title: '다른 메신저로 옮기자는 말이 있어요',
    why: '처음 만난 앱의 신고·차단 기능을 피하려고 텔레그램이나 왓츠앱 같은 곳으로 옮기자고 하는 경우가 많아요.',
    res: [
      /(텔레그램|telegram|텔레\s*아이디|왓츠\s*앱|whatsapp|위챗|wechat|(?<![온오])라인\s*(아이디|으로|id|추가))/i,
      /(카톡|여기|이\s*앱)\s*말고[^.\n?!]{0,15}(얘기|대화|연락|하자)/,
    ],
  },
  {
    key: 'avoid_meeting',
    modes: ['date', 'collab', 'trade', 'hire'],
    title: '영상통화나 만남을 피하는 말이 있어요',
    why: '남의 사진을 쓰는 사람은 얼굴을 보여 줄 수 없어서 영상통화와 만남을 계속 미뤄요. 요즘은 영상도 꾸밀 수 있으니 짧은 영상통화만으로도 안심하긴 어려워요.',
    res: [
      /(영상\s*통화|화상\s*통화|페이스\s*타임|영통|카메라)[^.\n?!]{0,15}(안\s*돼|안\s*되|못|어렵|고장|불가|금지|힘들)/,
      /(보안\s*(때문|상)|부대\s*규정|회사\s*규정|기밀)[^.\n?!]{0,15}(못|안\s*돼|어렵)/,
      /(만나기|얼굴\s*보기)\s*(는\s*)?(어렵|힘들)|(휴가|귀국|파견\s*끝나)[^.\n?!]{0,6}(나오면|받으면|하면)\s*만나/,
    ],
  },
  {
    key: 'overseas_persona',
    modes: ['date', 'invest'],
    title: '해외에 있다거나 특별한 직업이라는 설정이 있어요',
    why: '해외 파병 군인, 국경없는의사회 의사, 해외 건설·석유 현장 근무자, 외교관은 로맨스스캠에서 가장 자주 쓰는 설정이에요. 만날 수 없는 이유와 돈이 필요한 이유를 같이 만들기 쉽기 때문이에요.',
    res: [
      /(파병|유엔\s*(평화|군)|UN\s*(평화|군)|미군|군의관|국경\s*없는\s*의사|해외\s*(근무|파견|건설\s*현장)|석유\s*(시추|회사|현장)|시추선|유조선|선장|외교관|시리아|예멘|아프가니스탄|소말리아)/i,
    ],
  },
  {
    key: 'app_install',
    modes: ALL,
    title: '앱 설치나 링크 클릭을 시키는 말이 있어요',
    why: '앱을 깔게 하거나 원격 조종 앱을 설치하게 하면 휴대폰 속 금융 정보가 넘어갈 수 있어요. 공식 앱스토어가 아닌 파일(apk)은 절대 설치하지 마세요.',
    res: [
      /(앱|어플)\s*(을|를)?\s*(설치|깔|다운)/,
      /(\.apk|apk\s*파일|팀\s*뷰어|teamviewer|애니\s*데스크|anydesk|원격\s*(제어|조종|지원))/i,
      /링크\s*(를|로)?\s*(눌러|클릭|들어가|접속)[^.\n?!]{0,15}(설치|로그인|인증|가입|입력)/,
    ],
  },
  {
    key: 'credentials',
    modes: ALL,
    title: '인증번호·비밀번호·신분증을 달라는 말이 있어요',
    why: '인증번호나 비밀번호를 알려 주면 내 이름으로 대출을 받거나 계좌가 털릴 수 있어요. 은행·경찰·회사 누구도 이걸 메시지로 묻지 않아요.',
    res: [
      /(인증\s*번호|OTP|비밀\s*번호|공동\s*인증서|공인\s*인증서|보안\s*카드|카드\s*번호|주민\s*(등록\s*)?번호|신분증)[^.\n?!]{0,15}(알려|보내|불러|찍어|입력|줘|주세요)/i,
    ],
  },
  {
    key: 'secret',
    modes: ALL,
    title: '주변에 말하지 말라는 말이 있어요',
    why: '가족이나 친구에게 묻지 못하게 하는 건 사기의 공통 수법이에요. 주변 사람이 한 번만 들어도 이상하다고 알아채는 경우가 많기 때문이에요.',
    res: [
      /(아무\s*(한테|에게)\s*도|가족\s*(한테|에게)\s*도|친구\s*(한테|에게)\s*도|주변\s*(에|사람\s*(한테|에게)))[^.\n?!]{0,10}(말하지|얘기하지|알리지)/,
      /(우리\s*둘만|둘만의)\s*비밀|비밀로\s*(해|하자|해야)/,
    ],
  },
  {
    key: 'urgency',
    modes: ALL,
    weak: true,
    title: '서두르게 하는 말이 있어요',
    why: '생각할 시간을 주지 않는 것도 사기에서 자주 보이는 흐름이에요. 진짜 좋은 기회는 하루 이틀 확인한다고 사라지지 않아요. 이것만으로 판단할 수는 없어요.',
    res: [
      /(오늘\s*안에|오늘\s*까지만|마감\s*임박|선착순|자리\s*(가\s*)?얼마\s*안\s*남|지금\s*아니면)/,
      /(지금\s*바로|당장)[^.\n?!]{0,10}(입금|보내|결제|가입|투자)/,
    ],
  },
  {
    key: 'easy_money_job',
    modes: ['sidejob', 'date', 'invest', 'trade'],
    title: '쉬운 일에 큰돈을 준다는 말이 있어요',
    why: '"좋아요 누르기", "리뷰 쓰기", "구매 대행" 같은 간단한 일에 큰돈을 준다는 제안은 처음엔 소액을 주고 나중에 큰돈을 넣게 만드는 부업 사기에서 자주 보여요.',
    res: [
      /(재택|부업|알바|아르바이트)[^.\n?!]{0,25}(\d+\s*만\s*원|고수익)/,
      /(하루|일당)\s*\d+\s*만\s*원/,
      /(좋아요|팔로우)\s*(누르|클릭|하기)|리뷰\s*(작성|알바)|구매\s*대행|미션\s*(수행|완료|단계)|간단한\s*(업무|작업|일)/,
    ],
  },
  {
    key: 'loan_offer',
    modes: ALL,
    title: '대출을 해 주겠다는 말이 있어요',
    why: '"기존 대출을 갚으면 저금리로 바꿔 준다", "신용 점수를 올려 준다"는 말은 대출 사기의 대표 문구예요.',
    res: [
      /(대출\s*(승인|가능|진행|해\s*줄)|저금리\s*(대환|전환)|신용\s*(점수|등급)\s*(을\s*)?(올려|상향)|기존\s*대출\s*(을\s*)?(상환|갚))/,
    ],
  },
  {
    key: 'other_name_account',
    modes: ALL,
    title: '다른 사람 이름의 계좌로 보내라는 말이 있어요',
    why: '본인 계좌가 아닌 친구·직원·대리인 계좌로 보내라고 하면 대포통장일 수 있어요. 문제가 생겨도 돈을 받은 사람을 찾기 어려워요.',
    res: [
      /(대리인|직원|친구|삼촌|사촌|지인|회사\s*담당자)\s*(의\s*)?(계좌|통장)/,
      /(명의|이름)\s*(가|이)?\s*(다르|다른)/,
    ],
  },
  {
    key: 'fast_romance',
    modes: ['date'],
    weak: true,
    title: '아주 빠르게 결혼·평생을 약속하는 말이 있어요',
    why: '알게 된 지 얼마 안 됐는데 결혼이나 평생을 약속하는 건 마음을 빨리 열게 하려는 흐름일 수 있어요. 이것만으로 판단할 수는 없지만 돈 이야기와 같이 나오면 꼭 확인하세요.',
    res: [
      /(결혼\s*하자|평생\s*(함께|같이)|영혼의\s*단짝|소울\s*메이트|같이\s*살자|미래를\s*함께|운명\s*(이야|인\s*것\s*같))/,
    ],
  },
];

function snippet(text, index, length) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  let lineEnd = text.indexOf('\n', index + length);
  if (lineEnd === -1) lineEnd = text.length;
  const from = Math.max(lineStart, index - 28);
  const to = Math.min(lineEnd, index + length + 28);
  return {
    before: (from > lineStart ? '…' : '') + text.slice(from, index),
    match: text.slice(index, index + length),
    after: text.slice(index + length, to) + (to < lineEnd ? '…' : ''),
  };
}

// 더 구체적인 갈래가 먼저 문장을 차지하도록 순서를 정한다
// (예: "수수료를 먼저 입금해" 는 '돈 보내 달라'보다 '먼저 내라'가 정확하다)
const ORDER = ['fee_first', 'gift_card', 'other_name_account', 'credentials', 'guaranteed_return'];
const ordered = [...PATTERNS].sort((a, b) => {
  const ia = ORDER.indexOf(a.key);
  const ib = ORDER.indexOf(b.key);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
});

export function analyzeChat(text, mode = 'date') {
  const src = String(text || '').slice(0, 20000);
  const hits = [];
  const used = []; // 이미 다른 신호의 근거로 쓴 글자 범위
  const overlaps = (s, e) => used.some(([us, ue]) => s < ue && e > us);
  for (const p of ordered) {
    if (!p.modes.includes(mode)) continue;
    const examples = [];
    for (const re of p.res) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
      for (const m of src.matchAll(g)) {
        if (overlaps(m.index, m.index + m[0].length)) continue;
        if (examples.some((e) => Math.abs(e.at - m.index) < 30)) continue;
        used.push([m.index, m.index + m[0].length]);
        examples.push({ at: m.index, ...snippet(src, m.index, m[0].length) });
        if (examples.length >= 2) break;
      }
      if (examples.length >= 2) break;
    }
    if (examples.length) hits.push({ pattern: p, examples: examples.map(({ at, ...rest }) => rest) });
  }
  // 화면에는 원래 정의한 순서대로
  return hits.sort((a, b) => PATTERNS.indexOf(a.pattern) - PATTERNS.indexOf(b.pattern));
}

export { snippet };

// 규칙 갈래 → DATE CHECK 13개 검증 항목
export const RULE_ITEM = {
  money_request: 'money',
  fee_first: 'money',
  gift_card: 'money',
  other_name_account: 'money',
  loan_offer: 'money',
  urgency: 'money',
  guaranteed_return: 'invest',
  invest_in_romance: 'invest',
  overseas_persona: 'invest',
  platform_move: 'invest',
  easy_money_job: 'invest',
  fast_romance: 'invest',
  secret: 'invest',
  credentials: 'privacy',
  app_install: 'privacy',
  avoid_meeting: 'avoid',
};

// '나:' 로 시작하는 줄(내가 한 말)은 규칙 검사에서 뺀다. 글자 위치는 그대로 둔다.
export function maskOwnLines(text) {
  const src = String(text || '');
  if (!/^\s*나\s*[:：]/m.test(src)) return src;
  return src.split('\n').map((line) => (/^\s*나\s*[:：]/.test(line) ? ' '.repeat(line.length) : line)).join('\n');
}

export function ruleSignals(text) {
  const src = String(text || '').slice(0, 20000);
  const masked = maskOwnLines(src);
  return analyzeChat(masked).map(({ pattern, examples }) => ({
    item: RULE_ITEM[pattern.key] || 'invest',
    key: pattern.key,
    level: pattern.weak ? 'note' : 'signal',
    title: pattern.title,
    text: pattern.why,
    // 가린 글이 아니라 원문에서 앞뒤를 다시 잘라 보여 준다
    evidence: examples.map((e) => {
      const at = masked.indexOf(e.match);
      return at >= 0 ? snippet(src, at, e.match.length) : e;
    }),
  }));
}
