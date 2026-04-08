import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase, getUsersCollection } from '../../../lib/database';
import { createToken, verifyPassword, verifyAdminCredentials } from '../../../lib/auth';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

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

  if (username === ADMIN_USERNAME && verifyAdminCredentials(username, password)) {
    const token = createToken({
      userId: 'admin',
      username: username,
      role: 'admin',
    });
    return res.status(200).json({ 
      token, 
      role: 'admin', 
      username,
      isAdmin: true 
    });
  }

  const { db } = await connectToDatabase();
  const usersCollection = getUsersCollection(db);

  const user = await usersCollection.findOne({ username });

  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (user.expiresAt && Date.now() > user.expiresAt) {
    return res.status(403).json({ 
      error: '使用期限已到期，请联系管理员续期', 
      expired: true 
    });
  }

  const token = createToken({
    userId: user._id.toString(),
    username: user.username,
    role: 'user',
  });

  return res.status(200).json({ 
    token, 
    role: 'user', 
    username: user.username,
    isAdmin: false,
    aiLimit: user.aiLimit || 10,
    aiUsed: user.aiUsed || 0,
    expiresAt: user.expiresAt,
  });
}
