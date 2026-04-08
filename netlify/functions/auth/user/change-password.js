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

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function authCheck(headers) {
  const auth = parseAuthHeader(headers.authorization);
  if (!auth) return null;
  return verifyToken(auth.token);
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const user = authCheck(event.headers);
  if (!user || user.role !== 'user') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: '未授权，请先登录' }) };
  }

  let body = {};
  try {
    if (event.body) body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { oldPassword, newPassword } = body;

  if (!oldPassword || !newPassword) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '请输入旧密码和新密码' }) };
  }

  if (newPassword.length < 6) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '新密码长度至少6位' }) };
  }

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');

    const userDoc = await usersCollection.findOne({ _id: new ObjectId(user.userId) });

    if (!userDoc || !verifyPassword(oldPassword, userDoc.password)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: '旧密码错误' }) };
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(user.userId) },
      { $set: { password: hashPassword(newPassword), updatedAt: Date.now() } }
    );

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('Change password error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '服务器错误' }) };
  }
};
