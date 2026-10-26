// 카카오톡 '대화 내보내기' 파일을 읽어 '나: …' · '상대: …' 줄로 바꾼다 (2026-10-26 오너: 내보내기 txt 도 받기).
// 브라우저 안에서만 읽는다 — 보낸 사람 이름은 서버로 보내지 않고 '나'와 '상대'로만 바꿔 보낸다(이름은 받지 않음, 최소 수집).
// 받는 모양:
//   PC(윈도우)   [홍길동] [오후 3:21] 메시지          날마다 '--------------- 2026년 10월 26일 월요일 ---------------'
//   휴대폰       2026년 10월 26일 오후 3:21, 홍길동 : 메시지   (아이폰은 '2026. 10. 26. 오후 3:21, …', 내 말은 '회원님')
//   영어 판      [Name] [3:21 PM] msg / October 26, 2026, 3:21 PM, Name : msg
//   맥           CSV(Date,User,Message)
//   위 파일이 든 zip(사진까지 함께 내보낸 경우), 여러 파일로 나뉜 내보내기
// 브라우저(public/app.js)와 시험(tests/kakao-export.test.mjs)이 같이 쓴다.

export const MAX_CHARS = 19500; // 서버가 대화 글을 2만 자에서 자르므로 그 안에서 최근 대화부터 담는다

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// 휴대폰에서 내보낸 파일은 내가 보낸 말을 '회원님'으로 적는다
const ME_NAMES = new Set(['회원님']);

const dayLabel = (y, m, d) => {
  const wd = new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay();
  return `${+y}년 ${+m}월 ${+d}일 ${WEEK[wd]}요일`;
};
const DATE_KO = String.raw`(\d{4})\s*(?:년|\.)\s*(\d{1,2})\s*(?:월|\.)\s*(\d{1,2})\s*(?:일|\.)?`;
const TIME = String.raw`(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp][Mm]))?`;

const TITLE = /^(.+?)\s*님과\s*카카오톡\s*대화\s*$|^(.+?)과\s*카카오톡\s*대화\s*$|^KakaoTalk Chats with (.+)$/;
const SAVED = /^(저장한\s*날짜|Date Saved)\s*:/i;
const PC_DAY = /^-{3,}\s*(.+?)\s*-{3,}\s*$/;
const PC_MSG = new RegExp(String.raw`^\[([^\]]{1,60})\]\s\[${TIME}\]\s?(.*)$`);
const MO_MSG = new RegExp(String.raw`^${DATE_KO}\s*${TIME}\s*,\s(.+?)\s:\s?(.*)$`);
const MO_SYS = new RegExp(String.raw`^${DATE_KO}\s*${TIME}\s*[,:]\s?(.*)$`);
const MO_DAY = new RegExp(String.raw`^${DATE_KO}\s*(?:[월화수목금토일]요일)?\s*(?:${TIME})?\s*$`);
const EN_MSG = /^([A-Z][a-z]+)\.?\s(\d{1,2}),\s(\d{4}),?\s(?:at\s)?(\d{1,2}):(\d{2})\s?([AP]M),\s(.+?)\s:\s?(.*)$/;
const EN_DAY = /^(?:[A-Z][a-z]+day,\s)?([A-Z][a-z]+)\s(\d{1,2}),\s(\d{4})$/;
// 들어옴·나감·초대 같은 안내 줄 — 대화가 아니라 뺀다
const SYSTEM = /님이 (들어왔습니다|나갔습니다|퇴장했습니다)|님을 (초대했습니다|내보냈습니다)|님이 .+님을 초대|채팅방 관리자가|운영정책을 위반한 메시지|메시지가 가려졌습니다|joined this chatroom|left this chatroom|invited .+ to/;
// 사진·이모티콘은 OCR 과 같은 표시로
const MEDIA = /^(사진|사진\s?\d+장|동영상|이모티콘|음성메시지|음성 메시지|파일|Photo|Photos|Video|Emoticon|Voice Message)$/i;
const FILE_NAME = /^[\w.-]+\.(jpe?g|png|gif|webp|heic|bmp|mp4|mov|m4a|aac|pdf|zip)$/i;

const monthOf = (s) => MONTHS[String(s).slice(0, 3).toLowerCase()] || 0;

function cleanText(t) {
  const s = String(t || '').trim();
  if (MEDIA.test(s)) return `[${s}]`;
  if (FILE_NAME.test(s)) return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(s) ? '[사진]' : /\.(mp4|mov)$/i.test(s) ? '[동영상]' : '[파일]';
  if (/^파일\s*:/.test(s)) return '[파일]';
  return s;
}

// 따옴표·쉼표·줄바꿈을 지키는 작은 CSV 읽기(맥 내보내기)
function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseCsv(text) {
  const rows = csvRows(text);
  const head = rows.shift().map((x) => x.trim().toLowerCase());
  const di = head.indexOf('date');
  const ui = head.indexOf('user');
  const mi = head.indexOf('message');
  const messages = [];
  for (const r of rows) {
    if (r.length < 3) continue;
    const m = String(r[di] || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const name = String(r[ui] || '').trim();
    if (!name) continue;
    messages.push({ day: m ? dayLabel(m[1], m[2], m[3]) : '', name, text: String(r[mi] || '') });
  }
  return { format: 'mac', title: '', messages };
}

// 글 전체 → { format, title, others(제목에 나온 상대), group, messages:[{day,name,text}], participants:[{name,count}], me(추정) }
export function parseKakao(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let out;
  if (/^\s*"?date"?\s*,\s*"?user"?\s*,\s*"?message"?/i.test(text)) out = parseCsv(text);
  else {
    const messages = [];
    let title = '';
    let day = '';
    let last = null;
    const fmt = { pc: 0, mobile: 0, en: 0 };
    for (const line0 of text.split('\n')) {
      const line = line0.replace(/\s+$/, '');
      if (!line.trim()) continue;
      let m;
      if (!title && !messages.length && (m = line.match(TITLE))) { title = (m[1] || m[2] || m[3] || '').trim(); continue; }
      if (SAVED.test(line)) continue;
      if ((m = line.match(PC_MSG))) { fmt.pc += 1; last = { day, name: m[1].trim(), text: m[6] }; messages.push(last); continue; }
      if ((m = line.match(MO_MSG))) {
        fmt.mobile += 1;
        day = dayLabel(m[1], m[2], m[3]);
        last = { day, name: m[8].trim(), text: m[9] };
        messages.push(last);
        continue;
      }
      if ((m = line.match(EN_MSG))) {
        fmt.en += 1;
        const mo = monthOf(m[1]);
        if (mo) day = dayLabel(m[3], mo, m[2]);
        last = { day, name: m[7].trim(), text: m[8] };
        messages.push(last);
        continue;
      }
      if ((m = line.match(PC_DAY))) {
        const k = m[1].match(new RegExp(DATE_KO));
        const e = m[1].match(/([A-Z][a-z]+)\s(\d{1,2}),\s(\d{4})/);
        day = k ? dayLabel(k[1], k[2], k[3]) : e && monthOf(e[1]) ? dayLabel(e[3], monthOf(e[1]), e[2]) : m[1];
        last = null;
        continue;
      }
      if ((m = line.match(MO_DAY))) { day = dayLabel(m[1], m[2], m[3]); last = null; continue; }
      if ((m = line.match(EN_DAY)) && monthOf(m[1])) { day = dayLabel(m[3], monthOf(m[1]), m[2]); last = null; continue; }
      if (MO_SYS.test(line) || SYSTEM.test(line)) { last = null; continue; }
      // 여러 줄로 쓴 메시지의 다음 줄
      if (last) last.text += `\n${line}`;
    }
    const format = messages.length ? (fmt.pc >= fmt.mobile && fmt.pc >= fmt.en ? 'pc' : fmt.mobile >= fmt.en ? 'mobile' : 'en') : '';
    out = { format, title, messages };
  }
  for (const msg of out.messages) msg.text = cleanText(msg.text);
  out.messages = out.messages.filter((x) => x.text);
  const count = new Map();
  for (const msg of out.messages) count.set(msg.name, (count.get(msg.name) || 0) + 1);
  out.participants = [...count].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
  out.group = /\(\d+명\)|\s\d+$/.test(out.title) || out.participants.length > 2;
  out.me = guessMe(out);
  return out;
}

// '나' 고르기 — 휴대폰 파일의 '회원님', 1:1 대화면 제목에 나온 사람의 반대편
function guessMe({ title, participants, group }) {
  const names = participants.map((p) => p.name);
  const alias = names.find((n) => ME_NAMES.has(n));
  if (alias) return alias;
  if (!group && title && names.length === 2 && names.includes(title)) return names.find((n) => n !== title);
  return null;
}

// '나:'·'상대:' 줄로 바꾼다. 길면 최근 대화부터 max 자까지 담고, 날이 바뀌는 곳에 [날짜] 줄을 넣는다.
// me 가 '' 이면 모두 '상대'(내가 보낸 말이 없는 경우).
export function toChatText(parsed, me, { max = MAX_CHARS } = {}) {
  const msgs = parsed.messages || [];
  const picked = [];
  let size = 0;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    const line = `${m.name === me ? '나' : '상대'}: ${m.text.replace(/\s*\n\s*/g, ' ').trim()}`;
    const dayCost = m.day && (i === 0 || msgs[i - 1].day !== m.day) ? m.day.length + 3 : 0;
    if (size + line.length + 1 + dayCost > max && picked.length) break;
    picked.unshift({ line, day: m.day });
    size += line.length + 1 + dayCost;
  }
  const lines = [];
  let cur = null;
  for (const p of picked) {
    if (p.day && p.day !== cur) { lines.push(`[${p.day}]`); cur = p.day; }
    lines.push(p.line);
  }
  let text = lines.join('\n');
  if (text.length > max) text = text.slice(text.length - max).replace(/^[^\n]*\n/, '');
  return {
    text,
    used: picked.length,
    total: msgs.length,
    from: picked[0]?.day || '',
    to: picked[picked.length - 1]?.day || '',
    trimmed: picked.length < msgs.length,
    mine: me ? picked.filter((p) => p.line.startsWith('나:')).length : 0,
  };
}

// ---------- 파일 읽기 (txt·csv·zip, UTF-8·UTF-16·EUC-KR) ----------
export function decodeBytes(u8) {
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder('euc-kr').decode(u8);
  }
}

const isZip = (u8) => u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4;
const MAX_TEXT = 80 * 1024 * 1024;

// zip 안의 대화 파일(.txt·.csv)만 꺼낸다 — 사진까지 든 큰 zip 이어도 필요한 부분만 잘라 읽는다
async function readZip(file) {
  const size = file.size;
  const tailLen = Math.min(size, 65557);
  const tail = new DataView(await file.slice(size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i -= 1) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('압축 파일을 열 수 없어요. 압축을 풀어 안에 있는 .txt 파일을 올려 주세요.');
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff) throw new Error('압축 파일이 너무 커서 열 수 없어요. 압축을 풀어 안에 있는 .txt 파일을 올려 주세요.');
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const entries = [];
  for (let p = 0; p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50;) {
    const method = cd.getUint16(p + 10, true);
    const csize = cd.getUint32(p + 20, true);
    const usize = cd.getUint32(p + 24, true);
    const nlen = cd.getUint16(p + 28, true);
    const elen = cd.getUint16(p + 30, true);
    const clen = cd.getUint16(p + 32, true);
    const off = cd.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen));
    entries.push({ method, csize, usize, off, name });
    p += 46 + nlen + elen + clen;
  }
  const texts = entries.filter((e) => /\.(txt|csv)$/i.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name) && e.usize > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (!texts.length) throw new Error('압축 파일 안에 대화 파일(.txt)이 없어요. 카카오톡에서 ‘텍스트 메시지만 보내기’로 다시 내보내 주세요.');
  if (texts.reduce((s, e) => s + e.usize, 0) > MAX_TEXT) throw new Error('대화 파일이 너무 커요. 최근 대화만 따로 내보내거나 글로 붙여 넣어 주세요.');
  const parts = [];
  for (const e of texts) {
    const lh = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('압축 파일이 손상됐어요. 압축을 풀어 .txt 파일을 올려 주세요.');
    const start = e.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const blob = file.slice(start, start + e.csize);
    let bytes;
    if (e.method === 0) bytes = new Uint8Array(await blob.arrayBuffer());
    else if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저에서는 압축 파일을 열 수 없어요. 압축을 풀어 .txt 파일을 올려 주세요.');
      bytes = new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else throw new Error('이 압축 방식은 열 수 없어요. 압축을 풀어 .txt 파일을 올려 주세요.');
    parts.push(decodeBytes(bytes));
  }
  return parts.join('\n');
}

// File(또는 Blob) → 글
export async function readChatFile(file) {
  if (!file || !file.size) throw new Error('빈 파일이에요. 카카오톡에서 대화를 다시 내보내 주세요.');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (isZip(head)) return readZip(file);
  if (file.size > MAX_TEXT) throw new Error('대화 파일이 너무 커요. 최근 대화만 따로 내보내거나 글로 붙여 넣어 주세요.');
  if (/\.(jpe?g|png|gif|webp|heic|pdf|mp4|mov)$/i.test(file.name || '')) throw new Error('대화 파일이 아니에요. 카카오톡 ‘대화 내보내기’로 받은 .txt 파일을 올려 주세요. 캡처 사진은 ‘캡처 올리기’에서 올리면 됩니다.');
  return decodeBytes(new Uint8Array(await file.arrayBuffer()));
}
