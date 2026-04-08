import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminCredentials, createToken } from '../../../lib/auth';

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
