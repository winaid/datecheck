// 집계. 원본(번호·사진·대화)과 리포트는 어디에도 쓰지 않는다(리포트는 암호화해 이용자 기기에 — token.mjs).
// 디스크에는 개인정보 없는 집계·삭제요청·관리자 접근 로그만 남긴다.
// Vercel 은 프로젝트 폴더에 쓸 수 없어 임시 폴더(/tmp)에 쓴다 — 함수가 다시 시작되면 사라진다.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const STORAGE = process.env.VERCEL ? 'ephemeral' : 'file';
const DATA = STORAGE === 'ephemeral' ? path.join(os.tmpdir(), 'datecheck-data') : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
try {
  fs.mkdirSync(DATA, { recursive: true });
} catch { /* 못 만들어도 메모리 집계로 계속 돈다 */ }

// 2026-10-22 오너 결정 — 무료 점검 + 정밀 분석(가격 시험) + 추가 상품(신고용 정리본·재검사). 정기 결제는 나중에.
// 정밀 분석 가격은 방문자마다 셋 중 하나로 고정해 결제율을 비교한다(PRICE_VARIANTS='4900,7900,9900').
export const PRICE_VARIANTS = String(process.env.PRICE_VARIANTS || '4900,7900,9900').split(',').map((n) => Number(n.trim())).filter((n) => n > 0);
export const PLANS = {
  free: { label: '무료 점검', price: 0 },
  full: { label: '정밀 분석', price: PRICE_VARIANTS[0] || null },
};
export const ADDONS = {
  casefile: { label: '신고용 정리본', price: Number(process.env.PRICE_CASEFILE) || 2900 },
  recheck: { label: '재검사', price: Number(process.env.PRICE_RECHECK) || 2900 },
};
// 같은 방문자는 늘 같은 가격 — 방문자 아이디의 해시로 고른다(화면 표시와 결제 금액이 같은 규칙)
export function priceFor(visitor) {
  if (!PRICE_VARIANTS.length) return null;
  const v = /^[a-z0-9]{8,32}$/i.test(String(visitor || '')) ? String(visitor) : '';
  if (!v) return PRICE_VARIANTS[0];
  const n = crypto.createHash('sha256').update(v).digest()[0];
  return PRICE_VARIANTS[n % PRICE_VARIANTS.length];
}

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
  } catch {
    return fallback;
  }
}
const metrics = load('metrics.json', { days: {}, api: {}, purge: { originals: 0, reports: 0 }, visitors: {} });
const requests = load('requests.json', []);
const adminLog = load('admin-log.json', []);

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(path.join(DATA, 'metrics.json'), JSON.stringify(metrics));
      fs.writeFileSync(path.join(DATA, 'requests.json'), JSON.stringify(requests));
      fs.writeFileSync(path.join(DATA, 'admin-log.json'), JSON.stringify(adminLog.slice(-500)));
    } catch { /* 쓰기 실패는 집계만 잃고 서비스는 계속 */ }
  }, 400);
  saveTimer.unref?.();
}

export function kstDay(t = Date.now()) {
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
}
function day() {
  const d = kstDay();
  metrics.days[d] ||= { events: {}, revenue: 0, apiKrw: 0, aiKrw: 0 };
  return metrics.days[d];
}

// ---------- 퍼널 이벤트 ----------
// 화면이 보내던 copy·안내 보기·인쇄도 받는다(버려지던 것, 2026-10-27). 화면이 보내도 되는 것은 app.mjs CLIENT_EVENTS 가 거른다
export const EVENT_TYPES = new Set(['landing_view', 'wizard_open', 'inputs_done', 'preview_view', 'plan_view', 'paid_free', 'paid_standard', 'paid_full', 'upgrade_full', 'addon_casefile', 'addon_recheck', 'report_view', 'official_click', 'naver_click', 'refund', 'copy', 'howto_zoom', 'casefile_print']);
const HOWTO = /^howto_(open_)?[a-z][a-z_-]{0,24}$/;
const MAX_VISITORS = 50_000; // 방문자 표가 한없이 커지지 않게

export function recordEvent(type, visitor) {
  if (!EVENT_TYPES.has(type) && !HOWTO.test(type)) return;
  const d = day();
  d.events[type] = (d.events[type] || 0) + 1;
  if (visitor && /^[a-z0-9]{8,32}$/i.test(visitor) && (metrics.visitors[visitor] || Object.keys(metrics.visitors).length < MAX_VISITORS)) {
    const v = (metrics.visitors[visitor] ||= { first: kstDay(), analyses: 0 });
    if (type === 'inputs_done') v.analyses += 1;
  }
  save();
}

export function recordRevenue(won) {
  if (won) day().revenue += won;
  save();
}

// 가격 시험 — 가격마다 무료 결과를 본 수(shown)와 정밀 분석 결제 수(paid)
export function recordVariant(price, kind) {
  if (!price || !['shown', 'paid'].includes(kind)) return;
  const d = day();
  d.variants ||= {};
  const v = (d.variants[price] ||= { shown: 0, paid: 0 });
  v[kind] += 1;
  save();
}

// ---------- 바깥 API 호출 ----------
export function recordApi(name, { ok, ms = 0, krw = 0, tokens = 0 }) {
  const a = (metrics.api[name] ||= { calls: 0, fails: 0, krw: 0, ms: 0, tokens: 0 });
  a.calls += 1;
  if (!ok) a.fails += 1;
  a.krw += krw;
  a.ms += ms;
  a.tokens += tokens;
  const d = day();
  d.api ||= {};
  const da = (d.api[name] ||= { calls: 0, fails: 0, krw: 0 });
  da.calls += 1;
  if (!ok) da.fails += 1;
  da.krw += krw;
  d.apiKrw += krw;
  if (name === 'gemini') d.aiKrw += krw;
  save();
}

export function noteOriginalsDiscarded(count) {
  metrics.purge.originals += count;
  metrics.purge.lastAt = Date.now();
  save();
}

// ---------- 삭제 요청·문의·신고 ----------
export function addRequest({ type, message, contact }) {
  const req = {
    id: crypto.randomBytes(4).toString('hex'),
    at: Date.now(),
    type: ['delete', 'inquiry', 'report'].includes(type) ? type : 'inquiry',
    message: String(message || '').slice(0, 2000),
    contact: String(contact || '').slice(0, 120),
    done: false,
  };
  requests.push(req);
  save();
  return req.id;
}

export function setRequestDone(id, done) {
  const r = requests.find((x) => x.id === id);
  if (r) {
    r.done = Boolean(done);
    save();
  }
  return Boolean(r);
}

// ---------- 관리자 ----------
export function logAdmin(action, ip) {
  adminLog.push({ at: Date.now(), action, ip: String(ip || '').replace(/^::ffff:/, '') });
  save();
}

function sumEvents(days, type) {
  return days.reduce((s, d) => s + (d.events?.[type] || 0), 0);
}
const rate = (a, b) => (b ? a / b : null);

export function adminStats() {
  const keys = [];
  for (let i = 13; i >= 0; i -= 1) keys.push(kstDay(Date.now() - i * 86400e3));
  const daily = keys.map((k) => ({ day: k, ...(metrics.days[k] || { events: {}, revenue: 0, apiKrw: 0, aiKrw: 0 }) }));
  const last30 = Object.entries(metrics.days)
    .filter(([k]) => k >= kstDay(Date.now() - 29 * 86400e3))
    .map(([, v]) => v);

  const landing = sumEvents(last30, 'landing_view');
  const started = sumEvents(last30, 'wizard_open');
  const analyzed = sumEvents(last30, 'inputs_done');
  const previewed = sumEvents(last30, 'preview_view');
  // 예전 Standard 결제는 무료 점검 쪽으로 센다
  const paidStd = sumEvents(last30, 'paid_standard') + sumEvents(last30, 'paid_free');
  const paidFull = sumEvents(last30, 'paid_full');
  const upgrades = sumEvents(last30, 'upgrade_full');
  const refunds = sumEvents(last30, 'refund');
  const casefiles = sumEvents(last30, 'addon_casefile');
  const rechecks = sumEvents(last30, 'addon_recheck');
  const paid = paidFull + upgrades;
  const variants = PRICE_VARIANTS.map((price) => {
    const shown = last30.reduce((s, d) => s + (d.variants?.[price]?.shown || 0), 0);
    const bought = last30.reduce((s, d) => s + (d.variants?.[price]?.paid || 0), 0);
    return { price, shown, paid: bought, rate: rate(bought, shown) };
  });
  const revenue = last30.reduce((s, d) => s + (d.revenue || 0), 0);
  const apiKrw = last30.reduce((s, d) => s + (d.apiKrw || 0), 0);
  const aiKrw = last30.reduce((s, d) => s + (d.aiKrw || 0), 0);
  const visitors = Object.values(metrics.visitors);
  const users = visitors.filter((v) => v.analyses >= 1).length;
  const repeat = visitors.filter((v) => v.analyses >= 2).length;

  return {
    generatedAt: Date.now(),
    today: daily[daily.length - 1],
    daily: daily.map((d) => ({ day: d.day, checks: d.events?.inputs_done || 0, paid: (d.events?.paid_full || 0) + (d.events?.upgrade_full || 0) })),
    funnel: { landing, started, analyzed, previewed, paid, paidStd, paidFull, upgrades, casefiles, rechecks },
    variants,
    kpi: {
      startRate: rate(started, landing),
      inputDoneRate: rate(analyzed, started),
      payRate: rate(paid, previewed),
      fullShare: rate(paid, previewed),
      upgradeRate: rate(upgrades, paidStd),
      aov: paid && revenue ? revenue / paid : null,
      costPerCheck: analyzed ? apiKrw / analyzed : null,
      reuseRate: rate(repeat, users),
      refundRate: rate(refunds, paid),
      cac: null,
    },
    prices: { variants: PRICE_VARIANTS, casefile: ADDONS.casefile.price, recheck: ADDONS.recheck.price },
    revenue,
    api: Object.entries(metrics.api).map(([name, a]) => ({ name, calls: a.calls, fails: a.fails, failRate: rate(a.fails, a.calls), krw: a.krw, avgMs: a.calls ? a.ms / a.calls : 0 })),
    aiKrw,
    storage: STORAGE,
    purge: {
      originals: metrics.purge.originals,
      lastAt: metrics.purge.lastAt || null,
      storedOnServer: 0,
    },
    requests: [...requests].reverse().slice(0, 100),
    adminLog: [...adminLog].reverse().slice(0, 60),
  };
}
