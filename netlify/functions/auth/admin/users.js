const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'pixelbead';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

const DEFAULT_EXPIRY_DAYS = 30;
const DEFAULT_AI_LIMIT = 10;

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

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function authCheck(headers) {
  const auth = parseAuthHeader(headers.authorization);
  if (!auth) return null;
  return verifyToken(auth.token);
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const user = authCheck(event.headers);
  if (!user || user.role !== 'admin') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: '未授权，请先登录' }) };
  }

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');

    if (event.httpMethod === 'GET') {
      const users = await usersCollection.find({}, { projection: { password: 0 } }).toArray();
      return { statusCode: 200, headers, body: JSON.stringify({ users }) };
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        if (event.body) body = JSON.parse(event.body);
      } catch (e) {}

      const { username, password, expiryDays, aiLimit } = body;

      if (!username || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '请输入用户名和密码' }) };
      }

      const existing = await usersCollection.findOne({ username });
      if (existing) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '用户名已存在' }) };
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

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          user: {
            _id: result.insertedId,
            username,
            aiLimit: limit,
            aiUsed: 0,
            createdAt: now,
            expiresAt: expiresAt,
          }
        })
      };
    }

    if (event.httpMethod === 'PUT') {
      let body = {};
      try {
        if (event.body) body = JSON.parse(event.body);
      } catch (e) {}

      const { id, password, expiryDays, aiLimit, resetAiUsage } = body;

      if (password) {
        if (id === 'admin') {
          return { statusCode: 400, headers, body: JSON.stringify({ error: '无法修改管理员密码' }) };
        }
        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { password: hashPassword(password), updatedAt: Date.now() } }
        );
      }

      if (expiryDays !== undefined && id !== 'admin') {
        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { expiresAt: Date.now() + expiryDays * 24 * 60 * 60 * 1000, updatedAt: Date.now() } }
        );
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
        return { statusCode: 200, headers, body: JSON.stringify({ newPassword: password }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;

      if (!id || id === 'admin') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '无法删除管理员账号' }) };
      }

      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: '用户不存在' }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('Users API error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '服务器错误' }) };
  }
};
