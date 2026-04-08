import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MongoClient, ObjectId } from 'mongodb';
import crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'pixelbead';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db(DB_NAME);
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client.db(DB_NAME);
}

function createSignature(header: string, payload: string): string {
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  return hmac.update(`${header}.${payload}`).digest('base64url');
}

function verifyToken(token: string): { userId: string; username: string; role: 'admin' | 'user' } | null {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;
    if (signature !== createSignature(header, payload)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    if (data.exp && Date.now() > data.exp) return null;
    return { userId: data.userId, username: data.username, role: data.role };
  } catch {
    return null;
  }
}

function parseAuthHeader(authHeader: string | undefined): { token: string } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return { token: authHeader.slice(7) };
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function authCheck(req: VercelRequest) {
  const auth = parseAuthHeader(req.headers.authorization);
  if (!auth) return null;
  return verifyToken(auth.token);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = authCheck(req);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请输入旧密码和新密码' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码长度至少6位' });
  }

  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  const userDoc = await usersCollection.findOne({ _id: new ObjectId(user.userId) });

  if (!userDoc || !verifyPassword(oldPassword, userDoc.password)) {
    return res.status(401).json({ error: '旧密码错误' });
  }

  await usersCollection.updateOne(
    { _id: new ObjectId(user.userId) },
    { $set: { password: hashPassword(newPassword), updatedAt: Date.now() } }
  );

  return res.status(200).json({ success: true });
}
