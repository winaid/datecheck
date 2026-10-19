// 리포트 봉투 — 결과를 서버에 저장하지 않고, 서버만 풀 수 있게 암호화해 이용자 기기로 보낸다.
// AES-256-GCM 이라 이용자가 내용을 보거나(결제 전 상세) 고칠 수(요금제·보관 시간) 없다.
// 운영에서는 REPORT_SECRET 을 꼭 따로 넣는다(없으면 다른 키에서 만들고, 그것도 없으면 개발용 고정값).
import crypto from 'node:crypto';
import zlib from 'node:zlib';

function key() {
  const s = process.env.REPORT_SECRET || process.env.ADMIN_KEY || process.env.GEMINI_API_KEY || 'date-check-local-dev';
  return crypto.createHash('sha256').update(`datecheck:${s}`).digest();
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj), 'utf8'))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url');
}

export function open(token) {
  try {
    const buf = Buffer.from(String(token || ''), 'base64url');
    if (buf.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const plain = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    return JSON.parse(zlib.inflateRawSync(plain).toString('utf8'));
  } catch {
    return null;
  }
}
