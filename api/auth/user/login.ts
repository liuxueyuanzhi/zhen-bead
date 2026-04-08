import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MongoClient } from 'mongodb';
import crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI;
const DB_NAME = 'pixelbead';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db(DB_NAME);
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db(DB_NAME);
}

function createToken(payload: { userId: string; username: string; role: 'admin' | 'user' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  const signature = hmac.update(`${header}.${payloadStr}`).digest('base64url');
  return `${header}.${payloadStr}.${signature}`;
}

function verifyPassword(password: string, hash: string): boolean {
  return crypto.createHash('sha256').update(password).digest('hex') === hash;
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

  if (verifyAdminCredentials(username, password)) {
    const token = createToken({ userId: 'admin', username: 'admin', role: 'admin' });
    return res.status(200).json({ 
      token, 
      role: 'admin', 
      username: 'admin',
      aiLimit: 999999,
      aiUsed: 0,
    });
  }

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');
    
    const user = await usersCollection.findOne({ username });
    
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (user.expiresAt && Date.now() > user.expiresAt) {
      return res.status(403).json({ error: '账号使用期限已到期，请联系管理员续期' });
    }

    const token = createToken({ 
      userId: user._id.toString(), 
      username: user.username, 
      role: 'user' 
    });

    return res.status(200).json({ 
      token, 
      role: 'user', 
      username: user.username,
      aiLimit: user.aiLimit || 10,
      aiUsed: user.aiUsed || 0,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
}
