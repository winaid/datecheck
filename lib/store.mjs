// 집계. 원본(번호·사진·대화)은 어디에도 쓰지 않는다. 조회 기록은 암호화 봉투로 데이터베이스에(app.mjs·db/schema.sql).
// 여기에는 개인정보 없는 화면 이벤트·바깥 API 비용·관리자 접근 로그만 남긴다. 문의는 데이터베이스가 없을 때만 여기에.
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
  metrics.days[d] ||= { events: {}, apiKrw: 0, aiKrw: 0 };
  return metrics.days[d];
}

// ---------- 데이터베이스로 보내기 (2026-10-28) ----------
// Vercel 은 함수가 다시 뜨면 /tmp 집계가 사라져 라이브 관리자 화면이 늘 0 이었다 → 같은 하루 합계를 데이터베이스에도 더한다.
// 요청 하나에서 생긴 것을 모았다가 응답 직전에 한 번에 보낸다(app.mjs flushMetrics) — 응답 뒤엔 함수가 멈춰 못 보낼 수 있다.
let sink = null;
const pending = [];
export function setMetricSink(fn) {
  sink = fn;
}
function queue(items) {
  if (sink) pending.push(...items);
}
export async function flushMetrics() {
  if (!sink || !pending.length) return;
  const items = pending.splice(0, pending.length);
  try {
    await Promise.race([sink(items), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* 집계를 못 보내도 서비스는 계속 */ }
}

// ---------- 퍼널 이벤트 ----------
// 화면이 보내도 되는 것은 app.mjs CLIENT_EVENTS 가 거른다. 결제·가격 시험 이벤트는 2026-10-27 결제를 없애며 뺐다
export const EVENT_TYPES = new Set(['landing_view', 'wizard_open', 'auth_open', 'signup', 'login', 'inputs_done', 'report_view', 'official_click', 'naver_click', 'copy', 'howto_zoom', 'casefile_print']);
const HOWTO = /^howto_(open_)?[a-z][a-z_-]{0,24}$/;
const MAX_VISITORS = 50_000; // 방문자 표가 한없이 커지지 않게

export function recordEvent(type, visitor) {
  if (!EVENT_TYPES.has(type) && !HOWTO.test(type)) return;
  const d = day();
  d.events[type] = (d.events[type] || 0) + 1;
  queue([{ k: `ev:${type}` }]);
  if (visitor && /^[a-z0-9]{8,32}$/i.test(visitor) && (metrics.visitors[visitor] || Object.keys(metrics.visitors).length < MAX_VISITORS)) {
    const v = (metrics.visitors[visitor] ||= { first: kstDay(), analyses: 0 });
    if (type === 'inputs_done') v.analyses += 1;
  }
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
  queue([{ k: `api:${name}`, n: 1, krw, ms: Math.round(ms) }, ...(ok ? [] : [{ k: `fail:${name}` }])]);
  save();
}

export function noteOriginalsDiscarded(count) {
  metrics.purge.originals += count;
  metrics.purge.lastAt = Date.now();
  if (count > 0) queue([{ k: 'purge:originals', n: count }]);
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

/**
 * 데이터베이스 하루 합계(admin_metrics)로 adminStats 와 같은 모양을 만든다 — 라이브(Vercel)에서는 이것을 쓴다.
 * 재사용률 = 30일 안에 두 번 이상 조회한 회원 / 조회한 회원 (로그인해야 조회하므로 방문자 대신 회원으로 센다)
 */
export function adminStatsFromDb(m) {
  const rows = Array.isArray(m?.rows) ? m.rows : [];
  const get = (day, key) => rows.find((r) => r.day === day && r.key === key);
  const sum = (key) => rows.filter((r) => r.key === key).reduce((s, r) => s + Number(r.n || 0), 0);
  const keys = [];
  for (let i = 13; i >= 0; i -= 1) keys.push(kstDay(Date.now() - i * 86400e3));
  const todayKey = keys[keys.length - 1];
  const todayEvents = {};
  for (const r of rows) if (r.day === todayKey && r.key.startsWith('ev:')) todayEvents[r.key.slice(3)] = Number(r.n || 0);
  const ev = (type) => sum(`ev:${type}`);
  const landing = ev('landing_view');
  const authOpen = ev('auth_open');
  const signups = ev('signup');
  const started = ev('wizard_open');
  const analyzed = ev('inputs_done');
  const viewed = ev('report_view');
  const apiRows = rows.filter((r) => r.key.startsWith('api:'));
  const apiKrw = apiRows.reduce((s, r) => s + Number(r.krw || 0), 0);
  const aiKrw = apiRows.filter((r) => r.key === 'api:gemini').reduce((s, r) => s + Number(r.krw || 0), 0);
  const names = [...new Set(apiRows.map((r) => r.key.slice(4)))];
  const api = names.map((name) => {
    const rs = apiRows.filter((r) => r.key === `api:${name}`);
    const calls = rs.reduce((s, r) => s + Number(r.n || 0), 0);
    const fails = sum(`fail:${name}`);
    const ms = rs.reduce((s, r) => s + Number(r.ms || 0), 0);
    return { name, calls, fails, failRate: rate(fails, calls), krw: rs.reduce((s, r) => s + Number(r.krw || 0), 0), avgMs: calls ? ms / calls : 0 };
  }).sort((a, b) => b.calls - a.calls);
  return {
    generatedAt: Date.now(),
    today: { day: todayKey, events: todayEvents },
    daily: keys.map((k) => ({ day: k, checks: Number(get(k, 'ev:inputs_done')?.n || 0), signups: Number(get(k, 'ev:signup')?.n || 0) })),
    funnel: { landing, authOpen, signups, started, analyzed, viewed },
    kpi: {
      startRate: rate(started, landing),
      signupRate: rate(signups, authOpen),
      inputDoneRate: rate(analyzed, started),
      costPerCheck: analyzed ? apiKrw / analyzed : null,
      reuseRate: rate(Number(m?.repeat30 || 0), Number(m?.users30 || 0)),
    },
    api,
    aiKrw,
    apiKrw,
    storage: 'database',
    purge: { originals: Number(m?.purgeOriginals || 0), lastAt: m?.purgeLastDay ? Date.parse(`${m.purgeLastDay}T00:00:00+09:00`) : null, lastIsDay: true, storedOnServer: 0 },
    requests: [],
    adminLog: (Array.isArray(m?.adminLog) ? m.adminLog : []).map((l) => ({ at: Date.parse(l.at), action: l.action, ip: l.ip })),
  };
}

export function adminStats() {
  const keys = [];
  for (let i = 13; i >= 0; i -= 1) keys.push(kstDay(Date.now() - i * 86400e3));
  const daily = keys.map((k) => ({ day: k, ...(metrics.days[k] || { events: {}, apiKrw: 0, aiKrw: 0 }) }));
  const last30 = Object.entries(metrics.days)
    .filter(([k]) => k >= kstDay(Date.now() - 29 * 86400e3))
    .map(([, v]) => v);

  const landing = sumEvents(last30, 'landing_view');
  const authOpen = sumEvents(last30, 'auth_open');
  const signups = sumEvents(last30, 'signup');
  const started = sumEvents(last30, 'wizard_open');
  const analyzed = sumEvents(last30, 'inputs_done');
  const viewed = sumEvents(last30, 'report_view');
  const apiKrw = last30.reduce((s, d) => s + (d.apiKrw || 0), 0);
  const aiKrw = last30.reduce((s, d) => s + (d.aiKrw || 0), 0);
  const visitors = Object.values(metrics.visitors);
  const users = visitors.filter((v) => v.analyses >= 1).length;
  const repeat = visitors.filter((v) => v.analyses >= 2).length;

  return {
    generatedAt: Date.now(),
    today: daily[daily.length - 1],
    daily: daily.map((d) => ({ day: d.day, checks: d.events?.inputs_done || 0, signups: d.events?.signup || 0 })),
    funnel: { landing, authOpen, signups, started, analyzed, viewed },
    kpi: {
      startRate: rate(started, landing),
      signupRate: rate(signups, authOpen),
      inputDoneRate: rate(analyzed, started),
      costPerCheck: analyzed ? apiKrw / analyzed : null,
      reuseRate: rate(repeat, users),
    },
    api: Object.entries(metrics.api).map(([name, a]) => ({ name, calls: a.calls, fails: a.fails, failRate: rate(a.fails, a.calls), krw: a.krw, avgMs: a.calls ? a.ms / a.calls : 0 })),
    aiKrw,
    apiKrw,
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
