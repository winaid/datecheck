// 네이버 검색 API — 번호·계좌·회사 이름이 나온 공개 글을 찾는다.
// 따옴표 검색이 정확히 먹지 않으므로 받은 결과를 다시 걸러서 쓴다.
import { recordApi } from './store.mjs';

const ENDPOINT = {
  web: 'webkr',
  blog: 'blog',
  cafe: 'cafearticle',
  kin: 'kin',
  news: 'news',
};

export const KIND_LABEL = {
  web: '웹문서',
  blog: '블로그',
  cafe: '카페',
  kin: '지식iN',
  news: '뉴스',
};

// 사기 피해 글에 같이 나오는 말
export const FRAUD_WORDS = /(사기|피해|먹튀|고소|잠수|연락\s*두절|연락\s*끊|돈\s*안\s*(줌|줘|갚)|폰지|유사\s*수신|다단계|스캠|피싱|사칭|도용|주의\s*하세요|조심\s*하세요)/;

export function naverReady() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

function strip(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

// 검색 API 는 초당 호출 한도가 있어 한꺼번에 많이 부르면 429 가 난다 → 동시 4개까지만
const MAX_ACTIVE = 4;
let active = 0;
const waiting = [];
async function slot(fn) {
  if (active >= MAX_ACTIVE) await new Promise((r) => waiting.push(r));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

async function call(url) {
  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
      },
      signal: AbortSignal.timeout(7000),
    });
  } finally {
    recordApi('naver', { ok: Boolean(r?.ok), ms: Date.now() - t0 });
  }
  return r;
}

async function search(kind, query, display = 30) {
  const url = `https://openapi.naver.com/v1/search/${ENDPOINT[kind]}.json?query=${encodeURIComponent(query)}&display=${display}`;
  let r = await slot(() => call(url));
  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 500));
    r = await slot(() => call(url));
  }
  if (!r.ok) throw new Error(`naver ${kind} ${r.status}`);
  const j = await r.json();
  return (j.items || []).map((it) => ({
    kind,
    title: strip(it.title),
    text: strip(it.description),
    url: it.originallink || it.link,
    date: formatDate(it.postdate || it.pubDate || ''),
  }));
}

function formatDate(raw) {
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return '';
}

// 여러 검색어 × 여러 갈래로 찾고, 같은 글은 한 번만, match 를 통과한 글만 남긴다
export async function findMentions(queries, kinds, match) {
  const jobs = queries.flatMap((q) => kinds.map((k) => search(k, q)));
  const settled = await Promise.allSettled(jobs);
  const seen = new Set();
  const items = [];
  let failed = 0;
  for (const s of settled) {
    if (s.status !== 'fulfilled') {
      failed += 1;
      continue;
    }
    for (const it of s.value) {
      if (!it.url || seen.has(it.url)) continue;
      seen.add(it.url);
      if (match(it)) items.push(it);
    }
  }
  return { items, failed, total: jobs.length };
}

// 숫자 사이의 하이픈·공백·점을 지워서 "010-1234-5678" 과 "01012345678" 을 같게 본다
export function joinDigitGroups(text) {
  return String(text).replace(/(\d)[\s.\-–)(]+(?=\d)/g, '$1');
}

export function toSource(it) {
  return { title: it.title, url: it.url, where: KIND_LABEL[it.kind] || '', date: it.date };
}
