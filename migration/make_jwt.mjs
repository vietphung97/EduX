// ============================================================
// make_jwt.mjs — sinh "anon key" (JWT HS256) cho PostgREST local
// Cách chạy:
//   node make_jwt.mjs "<jwt-secret trong postgrest.conf>" anon
// Kết quả in ra → dán vào VITE_SUPABASE_ANON_KEY trong .env.local
// ============================================================
import crypto from 'node:crypto';

const [secret, role = 'anon'] = process.argv.slice(2);
if (!secret || secret.length < 32) {
  console.error('Cach dung: node make_jwt.mjs "<jwt-secret >=32 ky tu>" [role]');
  process.exit(1);
}

const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const header = b64u({ alg: 'HS256', typ: 'JWT' });
const payload = b64u({
  role,
  iss: 'edux-local',
  exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600, // 10 năm
});
const sig = crypto
  .createHmac('sha256', secret)
  .update(`${header}.${payload}`)
  .digest('base64url');

console.log(`${header}.${payload}.${sig}`);
