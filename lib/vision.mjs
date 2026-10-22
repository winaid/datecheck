// 사진 도용 확인 — 구글 Cloud Vision '웹 검색(WEB_DETECTION)'으로 같은 사진이 올라간 웹페이지를 찾는다.
// 2026-10-22 오너 결정(사진 도용 확인 진행). 키: GOOGLE_VISION_API_KEY (Cloud Vision API 를 켠 프로젝트의 API 키).
// 사진은 이 요청에만 쓰고 우리 서버에는 남기지 않는다. 얼굴로 사람을 찾는 기능이 아니라 '같은 파일·같은 사진'을 찾는다.
import { recordApi } from './store.mjs';

// 웹 검색 1,000건당 3.5달러(월 1,000건까지 무료) — 관리자 화면 원가 추정용
const KRW_PER_CALL = (3.5 / 1000) * 1400;

export function visionReady() {
  return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const clean = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

export async function webDetect(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/[a-z]+;base64,(.+)$/);
  if (!m) return null;
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(process.env.GOOGLE_VISION_API_KEY)}`;
  const body = { requests: [{ image: { content: m[1] }, features: [{ type: 'WEB_DETECTION', maxResults: 15 }] }] };
  const t0 = Date.now();
  let ok = false;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (!r.ok || j.responses?.[0]?.error) throw new Error(`vision ${r.status} ${JSON.stringify(j.error || j.responses?.[0]?.error || '').slice(0, 200)}`);
    ok = true;
    const w = j.responses?.[0]?.webDetection || {};
    // 같은 사진(전체 일치)이 있는 페이지와, 잘리거나 고친 사진(부분 일치)만 있는 페이지를 나눈다
    const pages = (w.pagesWithMatchingImages || []).map((p) => ({
      url: p.url,
      host: hostOf(p.url),
      title: clean(p.pageTitle) || hostOf(p.url),
      full: (p.fullMatchingImages || []).length > 0,
    })).filter((p) => p.host);
    return {
      fullPages: pages.filter((p) => p.full),
      partialPages: pages.filter((p) => !p.full),
      fullImages: (w.fullMatchingImages || []).length,
      partialImages: (w.partialMatchingImages || []).length,
    };
  } finally {
    recordApi('vision', { ok, ms: Date.now() - t0, krw: ok ? KRW_PER_CALL : 0 });
  }
}
