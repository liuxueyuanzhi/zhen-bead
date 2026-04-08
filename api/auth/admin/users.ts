import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { connectToDatabase, getUsersCollection } from '../../../lib/database';
import { hashPassword, parseAuthHeader, verifyToken } from '../../../lib/auth';

const DEFAULT_EXPIRY_DAYS = 30;
const DEFAULT_AI_LIMIT = 10;

function authCheck(req: VercelRequest) {
  const auth = parseAuthHeader(req.headers.authorization);
  if (!auth) return null;
  return verifyToken(auth.token);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = authCheck(req);
  if (!user || user.role !== 'admin') {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  const { db } = await connectToDatabase();
  const usersCollection = getUsersCollection(db);

  if (req.method === 'GET') {
    const users = await usersCollection.find({}, { projection: { password: 0 } }).toArray();
    return res.status(200).json({ users });
  }

  if (req.method === 'POST') {
    const { username, password, expiryDays, aiLimit } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const existing = await usersCollection.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const days = expiryDays ?? DEFAULT_EXPIRY_DAYS;
    const limit = aiLimit ?? DEFAULT_AI_LIMIT;
    const now = Date.now();
    const expiresAt = now + days * 24 * 60 * 60 * 1000;

    const result = await usersCollection.insertOne({
      username,
      password: hashPassword(password),
      aiLimit: limit,
      aiUsed: 0,
      createdAt: now,
      expiresAt: expiresAt,
      updatedAt: now,
    });

    return res.status(201).json({ 
      user: { 
        _id: result.insertedId, 
        username, 
        aiLimit: limit,
        aiUsed: 0,
        createdAt: now,
        expiresAt: expiresAt,
      } 
    });
  }

  if (req.method === 'PUT') {
    const { id, password, expiryDays, aiLimit, resetAiUsage } = req.body || {};

    if (password) {
      if (id === 'admin') {
        return res.status(400).json({ error: '无法修改管理员密码' });
      }
      await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { password: hashPassword(password), updatedAt: Date.now() } }
      );
    }

    if (expiryDays !== undefined && id !== 'admin') {
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (user) {
        const newExpiry = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { expiresAt: newExpiry, updatedAt: Date.now() } }
        );
      }
    }

    if (aiLimit !== undefined && id !== 'admin') {
      await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { aiLimit: aiLimit, updatedAt: Date.now() } }
      );
    }

    if (resetAiUsage && id !== 'admin') {
      await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { aiUsed: 0, updatedAt: Date.now() } }
      );
    }

    if (password) {
      return res.status(200).json({ newPassword: password });
    }
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id as string;

    if (!id || id === 'admin') {
      return res.status(400).json({ error: '无法删除管理员账号' });
    }

    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
