// Vercel 함수 — /api/* 요청을 받아 lib/app.mjs 로 넘긴다 (vercel.json rewrites 참고)
import { handle } from '../lib/app.mjs';

export default function handler(req, res) {
  return handle(req, res);
}
