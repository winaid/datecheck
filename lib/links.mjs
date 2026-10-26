// 공식 조회처 — 기획서 4장 '공식 참고처'. 주소를 바꿀 땐 실제로 열어 보고 바꿀 것.
export const LINKS = {
  // guide: 리포트에서 누르면 바로 가지 않고 '어디에 검색하나' 화면 캡처 팝업을 먼저 연다(public/img/howto)
  police: { label: '경찰민원24 사이버사기 피해신고 이력조회', short: '경찰민원24 사기 이력조회', url: 'https://minwon24.police.go.kr/main.do', guide: 'police' },
  thecheat: { label: '더치트 피해사례 검색', url: 'https://thecheat.co.kr/rb/?mod=_search', guide: 'thecheat' },
  sexoffender: { label: '성범죄자 알림e', url: 'https://www.sexoffender.go.kr/' },
  boho: { label: 'KISA 보호나라', url: 'https://www.boho.or.kr/' },
  whois: { label: 'KISA 후이즈 검색', url: 'https://whois.kr/' },
  hometax: { label: '국세청 홈택스', url: 'https://hometax.go.kr/' },
  dart: { label: 'DART 전자공시 검색', short: 'DART 전자공시', url: 'https://dart.fss.or.kr/' },
  hira: { label: '건강보험심사평가원 병원·약국 찾기', short: '심평원 병원 찾기', url: 'https://www.hira.or.kr/' },
  fiu: { label: '금융정보분석원 신고 가상자산사업자', short: 'FIU 신고 가상자산사업자', url: 'https://www.kofiu.go.kr/' },
  fssCompany: { label: '금융감독원 제도권 금융회사 조회', short: '금감원 제도권 금융회사', url: 'https://fine.fss.or.kr/fine/fncco/systemFncCo/list.do?menuNo=900038' },
  lens: { label: '구글 렌즈로 같은 사진 찾기', url: 'https://lens.google.com/' },
  tineye: { label: 'TinEye로 같은 사진 찾기', url: 'https://tineye.com/' },
  ecrm: { label: '경찰청 사이버범죄 신고시스템', short: '사이버범죄 신고', url: 'https://ecrm.police.go.kr/minwon/main' },
};

// 2026-10-22 오너 결정 — 네이버 검색 API(유료 서비스 사용 금지 약관)는 쓰지 않고, 이용자가 네이버에서 직접 찾도록 검색 결과 화면으로 연결한다
export function naverSearch(query, label) {
  return { label, short: label, url: `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`, naver: true };
}

// 공정위 사업자정보 공개 화면 (쇼핑몰 하단 '사업자정보확인'과 같은 곳)
export function ftcBizLink(bizDigits) {
  return { label: '공정위 사업자정보 공개 화면', url: `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${encodeURIComponent(bizDigits)}` };
}

// STEP 8 — 필요한 경우 공식 조회 버튼만 제공
export const OFFICIAL = [
  { ...LINKS.sexoffender, text: '성범죄자 공개정보는 공식 서비스에서 직접 확인할 수 있습니다.' },
  { ...LINKS.police, text: '전화번호·계좌번호·이메일이 최근 사이버사기로 신고됐는지 공식 사이트에서 확인합니다.' },
  { ...LINKS.boho, text: '문자나 메신저로 받은 링크가 스미싱인지 공식 사이트에서 확인합니다.' },
];

// 신고용 정리본 — 신고·상담처
export const REPORT_TO = [
  { name: '경찰 112', text: '돈을 보냈거나 보내라는 요구를 받고 있다면 바로 신고합니다.' },
  { name: '경찰청 사이버범죄 신고시스템', text: '이 정리본과 캡처를 붙여 온라인으로 신고할 수 있습니다.', url: 'https://ecrm.police.go.kr/minwon/main' },
  { name: '돈을 보낸 은행 고객센터', text: '받는 계좌의 지급정지를 요청합니다. 빠를수록 좋습니다.' },
  { name: '금융감독원 1332', text: '피해 구제 절차를 상담합니다.' },
];

export const IF_SENT = [
  '바로 112에 신고하세요.',
  '돈을 보낸 은행 고객센터에 받는 계좌의 지급정지를 요청하세요.',
  '금융감독원 1332에서도 피해 상담을 받을 수 있습니다.',
  '대화, 프로필, 송금 내역은 지우지 말고 캡처해 두세요.',
];
