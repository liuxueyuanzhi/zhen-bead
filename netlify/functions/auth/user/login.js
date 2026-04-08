const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'pixelbead';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db(DB_NAME);
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined');
  cachedClient = new MongoClient(MONGODB_URI);
  await cachedClient.connect();
  return cachedClient.db(DB_NAME);
}

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  const signature = hmac.update(`${header}.${payloadStr}`).digest('base64url');
  return `${header}.${payloadStr}.${signature}`;
}

function verifyPassword(password, hash) {
  return crypto.createHash('sha256').update(password).digest('hex') === hash;
}

function verifyAdminCredentials(username, password) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body = {};
  try {
    if (event.body) {
      body = JSON.parse(event.body);
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { username, password } = body;

  if (!username || !password) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '请输入用户名和密码' }) };
  }

  if (verifyAdminCredentials(username, password)) {
    const token = createToken({ userId: 'admin', username: 'admin', role: 'admin' });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token,
        role: 'admin',
        username: 'admin',
        aiLimit: 999999,
        aiUsed: 0,
      })
    };
  }

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ username });

    if (!user || !verifyPassword(password, user.password)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: '用户名或密码错误' }) };
    }

    if (user.expiresAt && Date.now() > user.expiresAt) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: '账号使用期限已到期，请联系管理员续期' }) };
    }

    const token = createToken({
      userId: user._id.toString(),
      username: user.username,
      role: 'user'
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token,
        role: 'user',
        username: user.username,
        aiLimit: user.aiLimit || 10,
        aiUsed: user.aiUsed || 0,
      })
    };
  } catch (error) {
    console.error('Login error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: '服务器错误，请稍后重试' }) };
  }
};
