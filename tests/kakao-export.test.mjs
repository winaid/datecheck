// 카톡 '대화 내보내기' 파일 읽기 (2026-10-26) — 네트워크 없이
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseKakao, toChatText, readChatFile, decodeBytes, MAX_CHARS } from '../public/kakao-export.js';

const PC = `홍길동 님과 카카오톡 대화
저장한 날짜 : 2026-10-26 17:20:11

--------------- 2026년 10월 24일 토요일 ---------------
[홍길동] [오후 3:21] 안녕하세요 프로필 보고 연락드려요
[김민지] [오후 3:22] 네 안녕하세요
[홍길동] [오후 3:25] 저는 지금 해외에서 일하고 있어요.
두 줄째 메시지예요
[홍길동] [오후 3:26] 사진
--------------- 2026년 10월 25일 일요일 ---------------
[홍길동] [오전 9:01] 출금하려면 수수료를 먼저 입금해야 해
[김민지] [오전 9:05] 얼마요?
`;

const ANDROID = `홍길동 님과 카카오톡 대화
저장한 날짜 : 2026년 10월 26일 오후 5:20

2026년 10월 24일 오후 3:21
2026년 10월 24일 오후 3:21, 홍길동 : 안녕하세요
2026년 10월 24일 오후 3:22, 회원님 : 네 안녕하세요
2026년 10월 25일 오전 9:01, 홍길동 : 출금하려면
수수료를 먼저 입금해야 해
2026년 10월 25일 오전 9:03, 홍길동 : b9c3e1a4.jpeg
2026년 10월 25일 오전 9:04, 홍길동 : 이모티콘
2026년 10월 25일 오전 9:05, 홍길동님이 나갔습니다.
`;

const IOS = `홍길동님과 카카오톡 대화
저장한 날짜 : 2026. 10. 26. 오후 5:20

2026년 10월 24일 토요일
2026. 10. 24. 오후 3:21, 홍길동 : 안녕하세요: 반가워요
2026. 10. 24. 15:22, 김민지 : 네
`;

const EN_PC = `KakaoTalk Chats with Hong
Date Saved : 2026-10-26 17:20:11

--------------- Saturday, October 24, 2026 ---------------
[Hong] [3:21 PM] Hello there
[Kim] [3:22 PM] Hi
`;

const EN_MOBILE = `Hong 님과 카카오톡 대화
October 24, 2026, 3:21 PM, Hong : Hello there
October 24, 2026, 3:22 PM, Kim : Hi
`;

const MAC = `Date,User,Message
2026-10-24 15:21:00,"홍길동","안녕하세요, 반가워요"
2026-10-24 15:22:00,"김민지","네
두 줄"
`;

const GROUP = `모임 (3명)과 카카오톡 대화
저장한 날짜 : 2026. 10. 26. 오후 5:20

2026. 10. 24. 오후 3:21, 가 : 하나
2026. 10. 24. 오후 3:22, 나영 : 둘
2026. 10. 24. 오후 3:23, 다솜 : 셋
`;

test('PC 파일 — 제목의 상대 반대편이 나, 여러 줄 메시지는 한 줄로, 사진은 [사진]', () => {
  const p = parseKakao(PC);
  assert.equal(p.format, 'pc');
  assert.equal(p.title, '홍길동');
  assert.equal(p.me, '김민지');
  assert.equal(p.messages.length, 6);
  const r = toChatText(p, p.me);
  assert.equal(r.text, [
    '[2026년 10월 24일 토요일]',
    '상대: 안녕하세요 프로필 보고 연락드려요',
    '나: 네 안녕하세요',
    '상대: 저는 지금 해외에서 일하고 있어요. 두 줄째 메시지예요',
    '상대: [사진]',
    '[2026년 10월 25일 일요일]',
    '상대: 출금하려면 수수료를 먼저 입금해야 해',
    '나: 얼마요?',
  ].join('\n'));
  assert.equal(r.trimmed, false);
  assert.equal(r.mine, 2);
  assert.ok(!r.text.includes('홍길동') && !r.text.includes('김민지'), '이름은 남기지 않는다');
});

test('안드로이드 파일 — 회원님이 나, 사진 파일 이름·이모티콘 표시, 들어옴·나감 줄은 뺀다', () => {
  const p = parseKakao(ANDROID);
  assert.equal(p.format, 'mobile');
  assert.equal(p.me, '회원님');
  const r = toChatText(p, p.me);
  assert.equal(r.text, [
    '[2026년 10월 24일 토요일]',
    '상대: 안녕하세요',
    '나: 네 안녕하세요',
    '[2026년 10월 25일 일요일]',
    '상대: 출금하려면 수수료를 먼저 입금해야 해',
    '상대: [사진]',
    '상대: [이모티콘]',
  ].join('\n'));
});

test('아이폰 파일 — 점 날짜·24시간 시각, 메시지 속 쌍점은 그대로', () => {
  const p = parseKakao(IOS);
  assert.equal(p.format, 'mobile');
  assert.equal(p.title, '홍길동');
  assert.equal(p.me, '김민지');
  assert.deepEqual(p.messages.map((m) => m.text), ['안녕하세요: 반가워요', '네']);
  assert.equal(p.messages[0].day, '2026년 10월 24일 토요일');
});

test('영어 판 PC·휴대폰', () => {
  const a = parseKakao(EN_PC);
  assert.equal(a.messages.length, 2);
  assert.equal(a.messages[0].day, '2026년 10월 24일 토요일');
  assert.equal(a.me, 'Kim');
  const b = parseKakao(EN_MOBILE);
  assert.equal(b.format, 'en');
  assert.deepEqual(b.participants.map((x) => x.name).sort(), ['Hong', 'Kim']);
  assert.equal(b.me, 'Kim');
});

test('맥 CSV — 따옴표 속 쉼표·줄바꿈, 제목이 없으면 나는 직접 고른다', () => {
  const p = parseKakao(MAC);
  assert.equal(p.format, 'mac');
  assert.equal(p.messages.length, 2);
  assert.equal(p.messages[0].text, '안녕하세요, 반가워요');
  assert.equal(p.me, null);
  assert.equal(toChatText(p, '김민지').text, '[2026년 10월 24일 토요일]\n상대: 안녕하세요, 반가워요\n나: 네 두 줄');
});

test('단체방 — 나를 짐작하지 않는다, 나 없음을 고르면 모두 상대', () => {
  const p = parseKakao(GROUP);
  assert.equal(p.group, true);
  assert.equal(p.me, null);
  assert.equal(p.participants.length, 3);
  const r = toChatText(p, '');
  assert.ok(r.text.split('\n').filter((l) => !l.startsWith('[')).every((l) => l.startsWith('상대: ')));
});

test('PC 에서 복사해 붙인 글(머리말 없음)도 읽는다', () => {
  const p = parseKakao('[홍길동] [오후 3:21] 돈 좀 보내줘\n[김민지] [오후 3:22] 왜?');
  assert.equal(p.messages.length, 2);
  assert.equal(p.me, null);
  assert.equal(toChatText(p, '김민지').text, '상대: 돈 좀 보내줘\n나: 왜?');
});

test('카톡 모양이 아니면 메시지 0 — 화면이 다른 방법을 안내한다', () => {
  assert.equal(parseKakao('그냥 메모입니다\n두 번째 줄').messages.length, 0);
  assert.equal(parseKakao('').messages.length, 0);
});

test('긴 대화 — 최근 메시지부터 서버 한도 안에서, 첫 줄은 날짜', () => {
  const lines = ['홍길동 님과 카카오톡 대화'];
  for (let d = 1; d <= 30; d += 1) {
    lines.push(`--------------- 2026년 9월 ${d}일 화요일 ---------------`);
    for (let i = 0; i < 100; i += 1) lines.push(`[${i % 2 ? '홍길동' : '김민지'}] [오후 3:${String(i % 60).padStart(2, '0')}] 9월 ${d}일 ${i}번째 메시지입니다 조금 길게 써 봅니다`);
  }
  const p = parseKakao(lines.join('\n'));
  assert.equal(p.messages.length, 3000);
  const r = toChatText(p, p.me);
  assert.ok(r.text.length <= MAX_CHARS, String(r.text.length));
  assert.ok(r.text.length > MAX_CHARS - 200, '한도를 거의 다 쓴다');
  assert.equal(r.trimmed, true);
  assert.match(r.text.split('\n')[0], /^\[2026년 9월 \d+일 .요일\]$/);
  assert.ok(r.text.endsWith('9월 30일 99번째 메시지입니다 조금 길게 써 봅니다'), '마지막 메시지는 꼭 들어간다');
  assert.equal(r.to, '2026년 9월 30일 수요일');
});

test('글자 인코딩 — UTF-8 BOM·UTF-16·EUC-KR', () => {
  assert.equal(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('안녕')])).replace(/^﻿/, ''), '안녕');
  assert.equal(decodeBytes(new Uint8Array(Buffer.from('﻿안녕', 'utf16le'))), '안녕');
  assert.equal(decodeBytes(new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7])), '안녕');
  const p = parseKakao(`﻿${PC.replace(/\n/g, '\r\n')}`);
  assert.equal(p.messages.length, 6);
  assert.equal(p.title, '홍길동');
});

// 작은 zip 만들기(시험용) — 압축 안 함(0)·deflate(8)
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const raw = Buffer.from(f.data);
    const body = f.deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(f.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(f.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, body);
    centrals.push(ch, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('zip — 사진과 함께 든 대화 파일만 꺼낸다(압축함·안 함)', async () => {
  for (const deflate of [false, true]) {
    const zip = makeZip([
      { name: 'KakaoTalk_Chats_2026/20261024_152100.jpg', data: Buffer.alloc(5000, 7) },
      { name: 'KakaoTalk_Chats_2026/KakaoTalkChats.txt', data: ANDROID, deflate },
    ]);
    const text = await readChatFile(new File([zip], 'KakaoTalk_Chats.zip'));
    const p = parseKakao(text);
    assert.equal(p.me, '회원님', `deflate=${deflate}`);
    assert.equal(p.messages.length, 5);
  }
});

test('zip — 여러 파일로 나뉜 내보내기는 이름 순서대로 잇는다', async () => {
  const [a, b] = [PC.split('--------------- 2026년 10월 25일')[0], `--------------- 2026년 10월 25일${PC.split('--------------- 2026년 10월 25일')[1]}`];
  const zip = makeZip([{ name: 'chat_2.txt', data: b, deflate: true }, { name: 'chat_1.txt', data: a, deflate: true }]);
  const p = parseKakao(await readChatFile(new File([zip], 'chat.zip')));
  assert.equal(p.messages.length, 6);
  assert.equal(p.messages.at(-1).text, '얼마요?');
});

test('파일 오류 — 빈 파일, 사진 파일, 대화 파일 없는 zip', async () => {
  await assert.rejects(readChatFile(new File([], 'a.txt')), /빈 파일/);
  await assert.rejects(readChatFile(new File([Buffer.from('xx')], 'capture.jpg')), /대화 파일이 아니에요/);
  const zip = makeZip([{ name: 'photo.jpg', data: Buffer.alloc(10) }]);
  await assert.rejects(readChatFile(new File([zip], 'only-photo.zip')), /대화 파일\(\.txt\)이 없어요/);
});

test('txt 파일 그대로 읽기', async () => {
  const p = parseKakao(await readChatFile(new File([Buffer.from(IOS)], 'KakaoTalk_20261026.txt')));
  assert.equal(p.messages.length, 2);
});
