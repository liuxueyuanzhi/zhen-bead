import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { connectToDatabase, getUsersCollection } from '../../../../lib/database';
import { parseAuthHeader, verifyToken } from '../../../../lib/auth';

function authCheck(req: VercelRequest) {
  const auth = parseAuthHeader(req.headers.authorization);
  if (!auth) return null;
  return verifyToken(auth.token);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = authCheck(req);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  const { db } = await connectToDatabase();
  const usersCollection = getUsersCollection(db);

  const userDoc = await usersCollection.findOne({ _id: new ObjectId(user.userId) });

  if (!userDoc) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (userDoc.expiresAt && Date.now() > userDoc.expiresAt) {
    return res.status(403).json({ 
      error: '使用期限已到期，请联系管理员续期', 
      expired: true 
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      aiLimit: userDoc.aiLimit || 10,
      aiUsed: userDoc.aiUsed || 0,
      remaining: (userDoc.aiLimit || 10) - (userDoc.aiUsed || 0),
    });
  }

  if (req.method === 'POST') {
    const aiLimit = userDoc.aiLimit || 10;
    const aiUsed = userDoc.aiUsed || 0;

    if (aiUsed >= aiLimit) {
      return res.status(403).json({ 
        error: 'AI 生成次数已用完，请联系管理员', 
        limitReached: true,
        aiLimit,
        aiUsed,
        remaining: 0,
      });
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(user.userId) },
      { $inc: { aiUsed: 1 }, $set: { updatedAt: Date.now() } }
    );

    return res.status(200).json({
      success: true,
      aiLimit,
      aiUsed: aiUsed + 1,
      remaining: aiLimit - aiUsed - 1,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
