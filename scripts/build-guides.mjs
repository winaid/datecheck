// 가이드 7쪽 + 사이트맵 + robots + 홈 머리말(검색·공유 정보)·홈 가이드 칸을 content/guides.mjs 에서 만든다.
// 실행: node scripts/build-guides.mjs   (SITE_URL 로 주소를 바꿀 수 있다 — 기본 https://datecheck.vercel.app)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, SITE, assertCardRules } from '../content/guides.mjs';
import { LINKS } from '../lib/links.mjs';

assertCardRules();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const TODAY = '2026-10-19';
const WJ = String.fromCharCode(0x2060);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 화면 글자: 가운뎃점·숫자 하이픈에서 꺾이지 않게 묶는다 (속성 값에는 쓰지 않는다)
const glue = (s) => esc(s).replace(/([^\s])([·ㆍ/])(?=[^\s])/g, `$1${WJ}$2${WJ}`).replace(/(\d)-(?=\d)/g, `$1${WJ}-${WJ}`);
const url = (p) => `${SITE}${p}`;
const cardImg = (g) => `/img/card/${g.slug}.jpg`;
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#E8506A" stroke="#E8506A" stroke-linejoin="round"><rect x="4" y="6" width="56" height="42" rx="14" stroke-width="0"/><path d="M15 42 L15.5 57 L31 45 Z" stroke-width="3"/></g><polyline points="19.5,27.5 28,35.5 44.5,18.5" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOGO = `<span class="logo-mark">${MARK}</span><span class="logo-a">DATE</span><span class="logo-b">CHECK</span>`;
const ORG = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'DATE CHECK', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: url('/img/logo-512.png'), width: 512, height: 512 } };
const HEAD_ICONS = [
  '<link rel="icon" href="/favicon.ico" sizes="32x32">',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
].join('\n  ');

const NAV = `<header class="nav solid" id="nav">
    <div class="nav-in">
      <a class="logo" href="/" aria-label="DATE CHECK 처음으로">${LOGO}</a>
      <nav class="nav-links" aria-label="주요 메뉴">
        <a href="/#checks">검증 항목</a>
        <a href="/#process">진행 방식</a>
        <a href="/#guides">확인 가이드</a>
        <a href="/#pricing">요금</a>
      </nav>
      <a class="btn btn-rose btn-sm" href="/?start=1">검증 시작</a>
      <button class="nav-burger" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="mnav"><span></span><span></span><span></span></button>
    </div>
  </header>
  <nav class="mnav" id="mnav" aria-label="모바일 메뉴">
    <a href="/#checks">검증 항목</a>
    <a href="/#process">진행 방식</a>
    <a href="/#guides">확인 가이드</a>
    <a href="/#pricing">요금</a>
    <a class="btn btn-rose" href="/?start=1">무료 사전분석 시작</a>
  </nav>`;

const FOOT = `<footer class="foot">
    <div class="wrap foot-in">
      <div>
        <a class="logo logo-sm" href="/">${LOGO}</a>
        <p class="foot-note w">DATE&nbsp;CHECK는 상대방의 신원이나 안전을 보증하지 않으며, 제공된 정보 범위에서 사실관계와 확인이 필요한 신호를 분석합니다.</p>
      </div>
      <div class="foot-links">
        <a class="link-btn" href="/#guides">확인 가이드</a>
        <span class="foot-tag">시험판 · 실제 결제 없음</span>
      </div>
    </div>
  </footer>`;

function guidePage(g) {
  const others = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 6);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      ORG,
      {
        '@type': 'Article',
        headline: g.h1,
        description: g.desc,
        image: url(cardImg(g)),
        inLanguage: 'ko-KR',
        datePublished: TODAY,
        dateModified: TODAY,
        author: { '@id': `${SITE}/#org` },
        publisher: { '@id': `${SITE}/#org` },
        mainEntityOfPage: url(`/guide/${g.slug}`),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DATE CHECK', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: g.name, item: url(`/guide/${g.slug}`) },
        ],
      },
      // 네이버 캐러셀(ListItem): 한 페이지 목록 하나·6개·이름·사진·내부 공개 주소
      {
        '@type': 'ItemList',
        name: '다른 확인 가이드',
        itemListElement: others.map((o, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/guide/${o.slug}`), name: o.name, image: url(cardImg(o)) })),
      },
    ],
  };
  const sections = g.sections.map((s) => `
        <section class="g-sec">
          <h2>${glue(s.h2)}</h2>
          ${(s.p || []).map((p) => `<p class="w">${glue(p)}</p>`).join('\n          ')}
          ${s.list ? `<ul class="g-list">${s.list.map((li) => `<li>${glue(li)}</li>`).join('')}</ul>` : ''}
          ${(s.after || []).map((p) => `<p class="w">${glue(p)}</p>`).join('\n          ')}
        </section>`).join('');
  const links = g.links.map((k) => LINKS[k]).filter(Boolean);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(g.h1)} | DATE CHECK</title>
  <meta name="description" content="${esc(g.desc)}">
  <link rel="canonical" href="${url(`/guide/${g.slug}`)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="DATE CHECK">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${esc(g.h1)}">
  <meta property="og:description" content="${esc(g.desc)}">
  <meta property="og:url" content="${url(`/guide/${g.slug}`)}">
  <meta property="og:image" content="${url(cardImg(g))}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="800">
  <meta property="article:published_time" content="${TODAY}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#0B1424">
  ${HEAD_ICONS}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="/app.css">
  ${jsonLd(graph)}
</head>
<body class="guide-page">
  <a class="skip" href="#main">본문으로 건너뛰기</a>
  ${NAV}
  <main id="main">
    <article class="guide">
      <header class="g-head">
        <div class="wrap g-narrow">
          <nav class="crumbs" aria-label="현재 위치"><a href="/">DATE CHECK</a><span aria-hidden="true">›</span><span>${glue(g.name)}</span></nav>
          <h1>${glue(g.h1)}</h1>
          <p class="g-lead w">${glue(g.desc)}</p>
        </div>
      </header>
      <div class="wrap g-narrow g-body">${sections}
        <section class="g-sec">
          <h2>공식 조회 바로가기</h2>
          <div class="g-links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${glue(l.label)}</a>`).join('')}</div>
        </section>
        <aside class="g-cta">
          <p class="g-cta-t">상대에게 받은 정보로 한 번에 확인하세요</p>
          <p class="w">전화번호, 사진, 대화, 링크를 넣으면 13개 항목을 AI와 공식 데이터로 교차검증합니다.</p>
          <a class="btn btn-rose" href="/?start=1">무료 사전분석 시작</a>
        </aside>
      </div>
      <section class="g-more" aria-labelledby="more-title">
        <div class="wrap">
          <h2 id="more-title">다른 확인 가이드</h2>
          <div class="g-cards">${others.map((o) => `
            <a class="g-card" href="/guide/${o.slug}"><img src="${cardImg(o)}" alt="${esc(o.name)}" width="800" height="800" loading="lazy"><span>${glue(o.name)}</span></a>`).join('')}
          </div>
        </div>
      </section>
    </article>
  </main>
  ${FOOT}
  <script src="/wrap.js"></script>
  <script src="/guide.js"></script>
</body>
</html>
`;
}

// ---------- 가이드 쪽 ----------
const gdir = path.join(PUB, 'guide');
fs.mkdirSync(gdir, { recursive: true });
for (const f of fs.readdirSync(gdir)) if (f.endsWith('.html')) fs.unlinkSync(path.join(gdir, f));
for (const g of GUIDES) fs.writeFileSync(path.join(gdir, `${g.slug}.html`), guidePage(g));

// ---------- 사이트맵·robots ----------
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${TODAY}</lastmod></url>
${GUIDES.map((g) => `  <url><loc>${url(`/guide/${g.slug}`)}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(PUB, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /api/
Disallow: /report/
Disallow: /admin

Sitemap: ${SITE}/sitemap.xml
`);

// ---------- 홈: 머리말 검색·공유 정보 + 가이드 칸 ----------
const idxPath = path.join(PUB, 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
const between = (html, tag, body) => {
  const a = `<!--${tag}:START-->`;
  const b = `<!--${tag}:END-->`;
  if (!html.includes(a) || !html.includes(b)) throw new Error(`index.html 에 ${a} 표식이 없음`);
  return html.slice(0, html.indexOf(a) + a.length) + body + html.slice(html.indexOf(b));
};
const homeTitle = 'DATE CHECK · 만나기 전, 확인하세요.';
const homeDesc = '상대에게 받은 정보를 AI와 공식 데이터로 교차검증해 사칭·사진도용·금전요구·사기 관련 확인 신호를 찾아드립니다.';
idx = between(idx, 'SEO', `
  <link rel="canonical" href="${SITE}/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DATE CHECK">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${esc(homeTitle)}">
  <meta property="og:description" content="${esc(homeDesc)}">
  <meta property="og:url" content="${SITE}/">
  <meta property="og:image" content="${url('/og.jpg')}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  ${HEAD_ICONS}
  ${jsonLd({ '@context': 'https://schema.org', '@graph': [ORG, { '@type': 'WebSite', '@id': `${SITE}/#site`, name: 'DATE CHECK', url: `${SITE}/`, inLanguage: 'ko-KR', publisher: { '@id': `${SITE}/#org` } }] })}
  `);
idx = between(idx, 'GUIDES', `
      <section class="guides" id="guides" aria-labelledby="guides-title">
        <div class="wrap">
          <div class="sec-head rv">
            <p class="eyebrow">확인 가이드</p>
            <h2 id="guides-title">혼자 먼저 확인해 볼 수도 있습니다</h2>
            <p class="w">공식 조회 사이트와 확인하는 순서를 정리했습니다. 한 번에 확인하려면 무료 사전분석을 이용하세요.</p>
          </div>
          <div class="g-cards g-cards-home">${GUIDES.map((g) => `
            <a class="g-card rv" href="/guide/${g.slug}"><img src="${cardImg(g)}" alt="${esc(g.name)}" width="800" height="800" loading="lazy"><span>${glue(g.name)}</span></a>`).join('')}
            <div class="g-card g-card-cta rv"><b>한 번에 확인하기</b><small>받은 정보를 넣으면 13개 항목을 교차검증합니다.</small><button class="btn btn-rose btn-sm" type="button" data-open-wizard>무료 사전분석 시작</button></div>
          </div>
        </div>
      </section>
      `);
fs.writeFileSync(idxPath, idx);
console.log(`가이드 ${GUIDES.length}쪽·사이트맵·robots·홈 머리말·홈 가이드 칸 완료 (${SITE})`);
