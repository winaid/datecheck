# DATE CHECK — AI 데이트·사기 안전검증 MVP

기획서 `Downloads/DATE_CHECK_MVP_개발자전달용_최종.docx` 기준으로 만든 로컬 시험판이다.

## 실행

```
npm start      # PC 서버(dev.mjs) http://localhost:4040   관리자 /admin
npm test       # 핵심 규칙 시험 (네트워크 없이)
npm run images # 배경 사진 3장 다시 만들기 (gpt-image-2, 비용 발생 — 오너 승인 뒤에만)
```

Node 20 이상, 외부 패키지 없음. 키는 `.env.local`.

| 키 | 쓰는 곳 |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | 대화 분석·캡처 글자 읽기·사진 관찰 (gemini-2.5-flash) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 번호·계좌·회사·SNS 아이디가 나온 공개 글 |
| `OPENAI_API_KEY` | 배경 사진 생성 스크립트만 |
| `ADMIN_KEY` | /admin 들어가는 키 |
| `DATA_GO_KR_KEY` (아직 없음) | 국세청 사업자 상태조회. 넣으면 바로 켜진다 |
| `PRICE_STANDARD`, `PRICE_FULL` (아직 없음) | 요금. 없으면 화면에 '가격 미정' |

## 흐름 (기획서 3장)

첫 화면 → 팝업에서 알고 있는 정보 선택(11종) → 한 화면에 하나씩 입력 → 확인·동의 → 무료 사전분석
("총 13개 항목 중 N개 검사 가능 / 확인 신호 M개 발견") → Standard 또는 Full Check → 테스트 결제 → `/report/아이디`.

## 13개 항목과 지금 상태

| 번호 | 항목 | 요금제 | 지금 |
|---|---|---|---|
| 1·2 | 전화번호·계좌번호 피해등록 | Standard | 공개 웹 언급·번호 종류는 됨. 더치트는 제휴 계약 대기 |
| 3~7 | 금전요구·투자유도·개인정보 요구·회피·진술 불일치 | Full | 됨 (규칙 16갈래 + 제미나이, 근거 문장은 원문 대조 후에만 표시) |
| 8 | 사진 검증 | Full | AI 관찰은 됨. 동일·유사 이미지 탐색은 이미지 검색 API 대기 |
| 9 | URL·도메인·SNS | Standard | 됨 (등록일 RDAP, .kr 포함·닮은 주소·운영기간 비교·SNS 아이디 언급) |
| 10 | 사업자 진위·상태 | Standard | 번호 규칙은 됨. 국세청은 DATA_GO_KR_KEY 대기 |
| 11 | 통신판매·방문판매 신고 | Standard | 공정위 공개 화면 링크. API 는 키 대기 |
| 12 | 회사 공개정보 | Standard | 뉴스·블로그 제목 언급은 됨. 금융위·OpenDART 키 대기 |
| 13 | 직업 공개정보 | Standard | 안내·심평원 링크. API 는 키 대기 |

성범죄자 알림e·경찰민원24·KISA 보호나라는 공식 조회 버튼만 둔다(STEP 8). 범죄경력은 다루지 않는다.

## 개인정보 (기획서 8장)

- 원본(번호·사진·대화)은 분석이 끝나면 버린다. 디스크에 쓰지 않는다.
- 리포트는 서버에 저장하지 않는다. 결과를 서버만 풀 수 있는 암호화 봉투(lib/token.mjs, AES-256-GCM)로 만들어 이용자 기기(localStorage)에 둔다. 결제 전 1시간·결제 후 24시간이 지나면 서버가 열어 주지 않고, 기기에서도 지운다. 그래서 리포트는 검증한 기기에서만 열린다.
- `data/` 에는 개인정보 없는 집계(퍼널·API 호출·파기 건수)와 삭제요청·문의, 관리자 접근 로그만 남는다.

## 화면 규칙

- 줄바꿈은 광화문선치과 규칙 런타임(`public/wrap.js`, 글 요소에 class `w`).
- 결과 문구는 기획서 7장: "확인 신호 N개", "추가 확인 권장". 사람 판정·점수·"사기일 가능성" 금지(`lib/ai.mjs` BANNED).
- 배경 사진 `public/img/{hero,bench,cups}.jpg` 는 gpt-image-2 로 만든 것(사람·손·글자 없음).

## 화면 크기 대응

- 320·360·390·430(폰), 768(태블릿), 1024·1280·1440(노트북), 1920·2560(큰 화면)에서 점검했다.
- 폰: 메뉴 버튼, 입력 팝업 전체 화면, 버튼 세로 배치, 누르는 곳 40px 이상.
- 태블릿: 입력 팝업은 가운데 창(왼쪽 단계 목록 없이).
- 큰 화면(1800px~): 본문·설명 글자 한 단계 키움, 기관 이름 띠는 화면 폭에 맞춰 이어 붙임.
- 줄바꿈: 가운뎃점·숫자 하이픈은 묶고(런타임 밖 글자도 `glueText`), 끝줄에 낱말 하나만 남는 자리는 런타임이 피한다.
- 점검 결과(10가지 폭 × 첫 화면·메뉴·입력 13단계·리포트 2종·관리자·문의 창): 넘침·낱말 쪼개짐·끝줄 한 낱말·버튼 두 줄·작은 버튼·12px 미만 글자 모두 0건.

## Vercel 배포

- 구조: 화면 파일은 `public/` 을 그대로 내보내고, `/api/*` 는 `api/index.mjs` 함수 하나가 받는다(`vercel.json` rewrites, 최대 60초). 처리 코드는 PC 서버와 같은 `lib/app.mjs`.
- PC 서버 파일 이름을 `server.mjs` 로 두면 Vercel 이 서버로 잘못 잡으므로 `dev.mjs` 로 둔다.
- Vercel 프로젝트 설정 → Environment Variables 에 넣을 것: `GEMINI_API_KEY`, `GEMINI_MODEL`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `ADMIN_KEY`, `REPORT_SECRET`(긴 임의 문자열). 넣지 않으면 AI·공개 글 검색은 '연동 전'으로 나오고 규칙 분석만 돈다.
- 요청 크기 한도 4.5MB — 화면이 캡처를 긴 변 1600px 로 줄이고, 넘으면 미리 막는다.
- 집계·문의·관리자 로그는 Vercel 에서 임시 폴더(/tmp)에 쌓여 함수가 다시 시작되면 사라진다. 정식 운영 전에 Upstash Redis 같은 저장소 연결이 필요하다(관리자 화면에 표시됨).

## 로고·파비콘·캐러셀(검색 노출)

- 로고 표식 `public/logo-mark.svg`(말풍선 + 체크). 머리글·팝업·관리자·바닥글에 같은 모양.
- 파비콘 `favicon.ico`(16·32·48)·`favicon.svg`, 애플·안드로이드 아이콘, `site.webmanifest`, 검색엔진 로고 `img/logo-512.png`(Organization.logo), 공유 이미지 `og.jpg`(1200×630).
- 캐러셀: 가이드 7쪽(`/guide/*`, 정적 HTML) — 쪽마다 머리말에 ItemList 하나·다른 가이드 6개(이름·주소·사진), 화면 카드는 본문 끝에 같은 순서·같은 사진. 카드 이름은 16자 이하·가운뎃점·괄호 없음(`content/guides.mjs` assertCardRules, `tests/seo.test.mjs`).
- 홈은 canonical `https://…/`(끝 /). 홈 첫 화면에는 카드 줄을 두지 않았다 — 홈 결과 카드까지 노리려면 첫 화면 400px 안에 카드 6장이 필요하다(플레이북).
- 다시 만들기:
  - 글·카드 이름 바꿈 → `node scripts/build-guides.mjs` (가이드 쪽·sitemap·robots·홈 머리말·홈 가이드 칸)
  - 아이콘·공유 이미지·카드 그림 → `SHARP_PATH=… PLAYWRIGHT_PATH=… node scripts/build-assets.mjs`
  - 카드 배경 사진(GPT, 비용) → `SHARP_PATH=… node scripts/gen-card-bg.mjs [slug]` — 오너 승인 뒤에만
- 도메인을 바꾸면 `SITE_URL=https://새주소 node scripts/build-guides.mjs` 로 다시 만든다.
- 네이버 서치어드바이저 등록·사이트맵 제출·수집 요청은 사이트 주인이 해야 한다. 카드는 네이버가 읽고 색인한 뒤에 붙고, 보장되지 않는다.
