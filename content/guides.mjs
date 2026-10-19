// 가이드 7편 — 네이버 캐러셀 카드가 가리킬 하위 페이지의 단일 소스.
// 카드 규칙(플레이북): 이름 16자 이하·가운뎃점/괄호 없음, 페이지마다 사진 다름, 한 페이지 목록 하나·6개.
// 고치면 `node scripts/build-guides.mjs` 로 public/guide/*.html·sitemap·홈 가이드 칸을 다시 만든다.

export const SITE = (process.env.SITE_URL || 'https://datecheck.vercel.app').replace(/\/$/, '');

export const GUIDES = [
  {
    slug: 'romance-scam',
    name: '로맨스스캠 확인 방법',
    h1: '로맨스스캠 확인 방법, 만나기 전에 볼 신호',
    desc: '메신저로 알게 된 사람이 송금이나 투자를 권한다면 로맨스스캠일 수 있습니다. 대화에서 자주 보이는 신호와 확인 방법을 정리했습니다.',
    prompt: 'A single deep red rose lying on a dark walnut table next to a smartphone placed face down, warm amber lamp light from the side, moody evening atmosphere.',
    sections: [
      {
        h2: '로맨스스캠은 이렇게 다가옵니다',
        p: [
          '대부분 SNS나 데이팅 앱에서 먼저 말을 걸어옵니다. 매일 안부를 묻고 다정한 말을 이어 가며 짧은 시간 안에 가까워지려 합니다.',
          '그러다 해외 파병, 해외 현장 근무, 긴 출장처럼 당장 만날 수 없는 사정을 이야기합니다. 마음이 열린 뒤에는 송금이나 투자 이야기가 나옵니다.',
        ],
      },
      {
        h2: '대화에서 자주 보이는 신호',
        p: ['아래 말이 하나라도 있다면 돈을 보내기 전에 한 번 더 확인하는 것이 좋습니다.'],
        list: [
          '영상통화나 만남을 계속 미루는 말',
          '텔레그램처럼 다른 메신저로 옮기자는 말',
          '원금이나 수익을 보장한다는 투자 권유',
          '출금하려면 수수료나 세금을 먼저 내라는 말',
          '가족이나 친구에게 말하지 말라는 부탁',
          '알게 된 지 얼마 안 돼 결혼을 약속하는 말',
        ],
      },
      {
        h2: '확인하는 방법',
        p: [
          '프로필 사진은 이미지 검색으로 다른 곳에 같은 사진이 있는지 찾아봅니다. 전화번호와 계좌번호는 경찰민원24와 더치트에서 사기 신고 이력을 조회할 수 있습니다.',
          '권하는 코인 거래소가 있다면 금융정보분석원에 신고된 사업자인지 확인합니다. 상대가 말한 회사나 직업도 공개된 정보와 맞는지 보세요.',
        ],
      },
      {
        h2: '이미 돈을 보냈다면',
        p: ['바로 112에 신고하고, 돈을 보낸 은행에 받는 계좌의 지급정지를 요청하세요. 대화와 송금 기록은 지우지 말고 남겨 두어야 합니다.'],
      },
    ],
    links: ['police', 'thecheat', 'lens', 'fiu'],
  },
  {
    slug: 'phone-check',
    name: '전화번호 사기 조회',
    h1: '전화번호 사기 조회, 신고 이력 확인하는 법',
    desc: '상대에게 받은 전화번호가 사기로 신고된 적이 있는지 무료로 조회하는 방법과 결과를 읽는 법을 정리했습니다.',
    prompt: 'A vintage cream colored rotary telephone on a deep navy desk, soft side window light, calm and clean composition with empty space around it.',
    sections: [
      {
        h2: '공식 조회는 경찰민원24에서',
        p: [
          '경찰민원24의 사이버사기 피해신고 이력조회에 번호를 넣으면 최근 3개월 동안 사이버범죄 신고시스템에 3회 이상 신고된 번호인지 알려 줍니다. 회원가입 없이 무료로 쓸 수 있습니다.',
          '민간 서비스인 더치트에서도 피해 사례로 등록된 번호인지 검색할 수 있습니다.',
        ],
      },
      {
        h2: '번호 모양으로 보는 신호',
        list: [
          '+로 시작하는 해외 번호인데 국내에 산다고 하는 경우',
          '070 인터넷 전화를 개인 연락처로 쓰는 경우',
          '050으로 시작하는 안심번호로만 연락하는 경우',
        ],
        after: ['이것만으로 사기라고 볼 수는 없지만, 상대가 한 말과 맞는지 확인할 거리가 됩니다.'],
      },
      {
        h2: '조회 결과를 읽는 법',
        p: [
          '신고 이력이 없다고 안전하다는 뜻은 아닙니다. 아직 신고되지 않았거나 신고가 3회보다 적으면 나오지 않습니다.',
          '반대로 이력이 나와도 지금 그 번호를 쓰는 사람이 사기를 쳤다고 단정할 수는 없습니다. 날짜와 내용을 보고 추가로 확인하세요.',
        ],
      },
    ],
    links: ['police', 'thecheat'],
  },
  {
    slug: 'account-check',
    name: '계좌번호 사기 조회',
    h1: '계좌번호 사기 조회, 송금 전에 확인할 것',
    desc: '돈을 보내기 전에 계좌번호의 사기 신고 이력을 조회하는 방법과 송금 요구에서 자주 보이는 신호를 정리했습니다.',
    prompt: 'A brown leather wallet and a few scattered coins on a white marble surface, soft morning daylight, minimal and clean, no cards visible.',
    sections: [
      {
        h2: '보내기 전에 조회하세요',
        p: [
          '경찰민원24의 사이버사기 피해신고 이력조회는 전화번호뿐 아니라 계좌번호도 조회할 수 있습니다. 더치트에서도 피해 사례로 등록된 계좌인지 검색할 수 있습니다.',
          '조회는 몇 초면 끝나지만, 보낸 돈을 되찾는 데는 긴 시간이 걸립니다.',
        ],
      },
      {
        h2: '송금 요구에서 자주 보이는 신호',
        list: [
          '본인이 아닌 친구나 직원, 대리인 명의 계좌로 보내라는 요구',
          '상품권 핀번호나 코인으로 달라는 요구',
          '돈을 받으려면 수수료나 보증금을 먼저 내라는 요구',
          '오늘 안에 보내야 한다며 서두르게 하는 말',
        ],
      },
      {
        h2: '보낸 뒤에 이상하다고 느꼈다면',
        p: [
          '돈을 보낸 은행 고객센터에 전화해 받는 계좌의 지급정지를 요청하고 112에 신고하세요. 로맨스스캠이나 투자 사기 계좌도 경찰 확인이 있으면 금융회사가 바로 지급정지할 수 있도록 제도가 바뀌었습니다.',
        ],
      },
    ],
    links: ['police', 'thecheat'],
  },
  {
    slug: 'photo-check',
    name: '프로필 사진 도용 확인',
    h1: '프로필 사진 도용 확인, 같은 사진 찾는 법',
    desc: '상대의 프로필 사진이 다른 사람의 사진은 아닌지 이미지 검색으로 확인하는 방법과 사진에서 볼 점을 정리했습니다.',
    prompt: 'Several blank white instant photo prints scattered on a light oak table with a brass magnifying glass resting on them, soft daylight, the prints show only plain landscapes or are empty.',
    sections: [
      {
        h2: '사진부터 확인하는 이유',
        p: [
          '로맨스스캠은 연예인이나 인플루언서, 모델의 사진을 가져다 쓰는 경우가 많습니다. 사진이 남의 것이라면 그 사람에 대한 다른 이야기도 사실이 아닐 가능성이 커집니다.',
        ],
      },
      {
        h2: '같은 사진을 찾는 방법',
        p: [
          '사진을 저장한 뒤 구글 렌즈나 TinEye 같은 이미지 검색에 올리면 같은 사진이나 비슷한 사진이 인터넷 어디에 있는지 보여 줍니다.',
          '다른 이름의 계정이나 화보, 광고 사진으로 나온다면 남의 사진을 쓰고 있을 수 있습니다.',
        ],
      },
      {
        h2: '사진에서 볼 점',
        list: [
          '다른 SNS 화면을 캡처한 흔적이 남아 있는지',
          '워터마크나 다른 계정 아이디가 보이는지',
          '광고 화보처럼 지나치게 보정된 사진인지',
          '군복이나 의사 가운처럼 직업을 드러내는 사진이 많은지',
        ],
      },
      {
        h2: '찾지 못했을 때',
        p: ['비공개 계정의 사진이나 AI로 만든 얼굴은 검색에 나오지 않습니다. 요즘은 영상통화도 합성할 수 있으니, 사진 확인은 여러 확인 가운데 하나로 쓰는 것이 좋습니다.'],
      },
    ],
    links: ['lens', 'tineye'],
  },
  {
    slug: 'investment-site',
    name: '투자 사이트 확인 방법',
    h1: '투자 사이트 확인 방법, 코인 거래소와 리딩방',
    desc: '상대가 권한 코인 거래소나 투자 사이트가 신고된 곳인지, 주소를 언제 만들었는지 확인하는 방법을 정리했습니다.',
    prompt: 'A glass jar filled with coins next to a small green potted plant on a windowsill, a city skyline softly blurred at dusk outside, calm composition.',
    sections: [
      {
        h2: '코인 거래소는 신고 명단부터',
        p: [
          '한국에서 가상자산 영업을 하려면 금융정보분석원에 신고해야 합니다. 신고된 사업자 현황은 금융정보분석원 홈페이지에서 볼 수 있고, 명단에 없는 곳이 한국 사람을 상대로 영업하면 불법입니다.',
          '상대가 알려 준 거래소가 명단에 없다면 가입하거나 돈을 넣지 마세요.',
        ],
      },
      {
        h2: '주식 정보와 리딩방은 금융감독원에서',
        p: ['증권사나 자산운용사처럼 돈을 맡아 굴리는 곳은 금융감독원의 제도권 금융회사 조회에서, 주식 정보를 파는 곳은 유사투자자문업자 조회에서 신고 여부를 확인할 수 있습니다.'],
      },
      {
        h2: '사이트 주소에서 보는 신호',
        list: [
          '만든 지 몇 주밖에 안 된 주소인데 오래 운영했다고 하는 경우',
          '유명 거래소 이름을 넣었지만 공식 주소와 다른 경우',
          '단축 주소라 실제 주소가 가려져 있는 경우',
          '수익이 났는데 출금하려면 수수료를 먼저 내라고 하는 경우',
        ],
      },
    ],
    links: ['fiu', 'fssCompany', 'boho'],
  },
  {
    slug: 'business-check',
    name: '사업자등록번호 조회',
    h1: '사업자등록번호 조회, 회사가 실제로 있는지',
    desc: '상대가 운영한다는 회사나 쇼핑몰이 실제로 영업 중인지 사업자등록번호로 확인하는 방법을 정리했습니다.',
    prompt: 'A neat stack of plain brown cardboard parcel boxes on a wooden shelf in soft warm light, minimal background, no labels or text on the boxes.',
    sections: [
      {
        h2: '국세청에서 영업 상태 확인',
        p: [
          '국세청 홈택스의 사업자 상태 조회에 번호를 넣으면 지금 영업 중인지, 휴업이나 폐업을 했는지 알 수 있습니다.',
          '사업자등록번호 10자리는 마지막 자리가 앞 숫자로 계산되는 규칙이 있어서, 규칙에 맞지 않으면 잘못 옮겨 적었거나 없는 번호일 수 있습니다.',
        ],
      },
      {
        h2: '쇼핑몰은 통신판매업 신고까지',
        p: ['온라인으로 물건을 파는 곳은 통신판매업 신고를 해야 합니다. 쇼핑몰 아래쪽의 사업자정보확인 버튼이나 공정거래위원회 사업자정보 공개 화면에서 신고 내용을 볼 수 있습니다.'],
      },
      {
        h2: '확인 결과를 읽는 법',
        p: ['회사가 실제로 있다는 것과 상대가 그 회사 사람이라는 것은 다릅니다. 회사 대표번호로 직접 전화해 확인하는 것이 가장 정확합니다.'],
      },
    ],
    links: ['hometax', 'dart'],
  },
  {
    slug: 'after-sending',
    name: '이미 돈을 보냈다면',
    h1: '사기 의심 송금, 이미 보냈다면 바로 할 일',
    desc: '사기가 의심되는 곳에 이미 돈을 보냈을 때 피해를 줄이기 위해 바로 해야 할 일을 순서대로 정리했습니다.',
    prompt: 'An antique hourglass with golden sand running through it on a dark table, warm side light, deep shadows, sense of urgency, minimal composition.',
    sections: [
      {
        h2: '가장 먼저, 지급정지와 신고',
        p: [
          '돈을 보낸 은행 고객센터에 전화해 받는 계좌의 지급정지를 요청하세요. 같은 때에 112에 신고하면 경찰 확인을 거쳐 계좌를 묶는 데 도움이 됩니다.',
          '빠를수록 돈이 빠져나가기 전에 막을 가능성이 커집니다.',
        ],
      },
      {
        h2: '증거는 지우지 마세요',
        p: ['대화 내용, 상대의 프로필과 아이디, 받은 링크, 송금 내역을 캡처해 두세요. 신고와 피해 환급 절차에서 모두 필요합니다.'],
      },
      {
        h2: '상담받을 곳',
        p: ['금융감독원 콜센터 1332에서 피해 상담과 절차 안내를 받을 수 있습니다. 경찰 사이버범죄 신고는 경찰민원24에서도 할 수 있습니다.'],
      },
      {
        h2: '두 번째 피해를 조심하세요',
        p: ['돈을 찾아 주겠다며 수수료를 요구하는 연락이 오는 경우가 있습니다. 피해 회복을 이유로 다시 돈을 보내라는 말에는 응하지 마세요.'],
      },
    ],
    links: ['police'],
  },
];

// 카드 규칙 검사 — 어기면 빌드를 멈춘다
export function assertCardRules() {
  const problems = [];
  const names = new Set();
  for (const g of GUIDES) {
    if ([...g.name].length > 16) problems.push(`${g.slug}: 이름 16자 초과`);
    if (/[·ㆍ()（）]/.test(g.name)) problems.push(`${g.slug}: 이름에 가운뎃점·괄호`);
    if (names.has(g.name)) problems.push(`${g.slug}: 이름 중복`);
    names.add(g.name);
  }
  if (GUIDES.length < 7) problems.push('가이드가 7편보다 적으면 페이지마다 카드 6장을 채울 수 없음');
  if (problems.length) throw new Error(`카드 규칙 위반\n${problems.join('\n')}`);
}
