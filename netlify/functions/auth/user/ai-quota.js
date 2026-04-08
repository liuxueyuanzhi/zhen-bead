const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'pixelbead';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db(DB_NAME);
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  cachedClient = new MongoClient(MONGODB_URI);
  await cachedClient.connect();
  return cachedClient.db(DB_NAME);
}

function createSignature(header, payload) {
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  return hmac.update(`${header}.${payload}`).digest('base64url');
}

function verifyToken(token) {
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

function parseAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return { token: authHeader.slice(7) };
}

function authCheck(headers) {
  const auth = parseAuthHeader(headers.authorization);
  if (!auth) return null;
  return verifyToken(auth.token);
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const user = authCheck(event.headers);
  if (!user || user.role !== 'user') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: '未授权，请先登录' }) };
  }

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');

    const userDoc = await usersCollection.findOne({ _id: new ObjectId(user.userId) });

    if (!userDoc) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: '用户不存在' }) };
    }

    if (userDoc.expiresAt && Date.now() > userDoc.expiresAt) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: '使用期限已到期，请联系管理员续期',
          expired: true
        })
      };
    }

    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          aiLimit: userDoc.aiLimit || 10,
          aiUsed: userDoc.aiUsed || 0,
          remaining: (userDoc.aiLimit || 10) - (userDoc.aiUsed || 0),
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const aiLimit = userDoc.aiLimit || 10;
      const aiUsed = userDoc.aiUsed || 0;

      if (aiUsed >= aiLimit) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: 'AI 生成次数已用完，请联系管理员',
            limitReached: true,
            aiLimit,
            aiUsed,
            remaining: 0,
          })
        };
      }

      await usersCollection.updateOne(
        { _id: new ObjectId(user.userId) },
        { $inc: { aiUsed: 1 }, $set: { updatedAt: Date.now() } }
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          aiLimit,
          aiUsed: aiUsed + 1,
          remaining: aiLimit - aiUsed - 1,
        })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('AI Quota error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '服务器错误' }) };
  }
};
