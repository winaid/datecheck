// 검색 노출 규칙 — 네이버 캐러셀(ListItem)·파비콘·로고·사이트맵 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, SITE } from '../content/guides.mjs';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (p) => fs.readFileSync(path.join(PUB, p), 'utf8');
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (ld) => ld.flatMap((d) => d['@graph'] || [d]);
const strip = (s) => s.replace(/⁠/g, '').replace(/&amp;/g, '&');

test('가이드마다 카드 목록 하나·6개·자기 자신 없음·이름 규칙·사진 있음·사진 중복 없음', () => {
  for (const g of GUIDES) {
    const html = read(`guide/${g.slug}.html`);
    const lists = nodes(ldOf(html)).filter((n) => n['@type'] === 'ItemList');
    assert.equal(lists.length, 1, `${g.slug}: ItemList ${lists.length}개`);
    const items = lists[0].itemListElement;
    assert.equal(items.length, 6, `${g.slug}: 항목 ${items.length}개`);
    const urls = new Set();
    const imgs = new Set();
    items.forEach((it, i) => {
      assert.equal(it.position, i + 1);
      assert.ok(it.url.startsWith(`${SITE}/guide/`), it.url);
      assert.notEqual(it.url, `${SITE}/guide/${g.slug}`, `${g.slug}: 자기 자신`);
      assert.ok([...it.name].length <= 16 && !/[·ㆍ()（）]/.test(it.name), `${g.slug}: 이름 규칙 ${it.name}`);
      const file = it.image.replace(SITE, '');
      assert.ok(fs.existsSync(path.join(PUB, file)), `${g.slug}: 사진 없음 ${file}`);
      urls.add(it.url);
      imgs.add(it.image);
    });
    assert.equal(urls.size, 6, `${g.slug}: 주소 중복`);
    assert.equal(imgs.size, 6, `${g.slug}: 사진 중복`);
  }
});

test('화면 카드 = 카드 목록 (이름·사진·순서), 카드는 본문 끝', () => {
  for (const g of GUIDES) {
    const html = read(`guide/${g.slug}.html`);
    const items = nodes(ldOf(html)).find((n) => n['@type'] === 'ItemList').itemListElement;
    const more = html.slice(html.indexOf('class="g-more"'));
    const cards = [...more.matchAll(/<a class="g-card" href="([^"]+)"><img src="([^"]+)"[^>]*><span>([^<]+)<\/span><\/a>/g)];
    assert.equal(cards.length, 6, `${g.slug}: 화면 카드 ${cards.length}`);
    cards.forEach(([, href, src, name], i) => {
      assert.equal(`${SITE}${href}`, items[i].url);
      assert.equal(`${SITE}${src}`, items[i].image);
      assert.equal(strip(name), items[i].name);
    });
    assert.ok(html.indexOf('class="g-more"') > html.indexOf('class="g-cta"'), `${g.slug}: 카드가 본문보다 위`);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}/guide/${g.slug}">`));
  }
});

test('홈: canonical 끝 / · 공유 이미지 · 파비콘 · 로고 · 사이트맵·robots', () => {
  const idx = read('index.html');
  assert.ok(idx.includes(`<link rel="canonical" href="${SITE}/">`), '홈 canonical 은 끝에 /');
  assert.ok(idx.includes(`<meta property="og:url" content="${SITE}/">`));
  assert.ok(idx.includes(`<meta property="og:image" content="${SITE}/og.jpg">`));
  for (const f of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest', 'og.jpg', 'img/logo-512.png', 'logo-mark.svg']) assert.ok(fs.existsSync(path.join(PUB, f)), f);
  const org = nodes(ldOf(idx)).find((n) => n['@type'] === 'Organization');
  assert.equal(org.logo.url, `${SITE}/img/logo-512.png`);
  const sm = read('sitemap.xml');
  assert.ok(sm.includes(`<loc>${SITE}/</loc>`));
  for (const g of GUIDES) assert.ok(sm.includes(`<loc>${SITE}/guide/${g.slug}</loc>`), g.slug);
  const robots = read('robots.txt');
  assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`) && robots.includes('Disallow: /report/'));
});
