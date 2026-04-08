import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { connectToDatabase, getUsersCollection } from '../../../lib/database';
import { hashPassword, parseAuthHeader, verifyToken, verifyPassword } from '../../../lib/auth';

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

  const { db } = await connectToDatabase();
  const usersCollection = getUsersCollection(db);

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
