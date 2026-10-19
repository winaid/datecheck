// PC 에서 띄우는 서버 (npm start). 같은 처리 코드를 Vercel 에서는 api/index.mjs 가 쓴다.
// 파일 이름을 server.mjs 로 두면 Vercel 이 이것을 서버로 잘못 잡으므로 dev.mjs 로 둔다.
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

// 키를 읽은 뒤에 불러와야 연동 상태가 맞게 잡힌다
const { handle } = await import('./lib/app.mjs');
const PORT = Number(process.env.PORT || 4040);
const HOST = process.env.HOST || '127.0.0.1';
const server = http.createServer(handle);
server.requestTimeout = 180_000;
server.listen(PORT, HOST, () => console.log(`DATE CHECK: http://localhost:${PORT}  (관리자 /admin)`));
