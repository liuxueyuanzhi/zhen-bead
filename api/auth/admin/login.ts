import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function createToken(payload: { userId: string; username: string; role: 'admin' | 'user' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  const signature = hmac.update(`${header}.${payloadStr}`).digest('base64url');
  return `${header}.${payloadStr}.${signature}`;
}

function verifyAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  if (!verifyAdminCredentials(username, password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = createToken({
    userId: 'admin',
    username: username,
    role: 'admin',
  });

  return res.status(200).json({ token, role: 'admin' });
}
