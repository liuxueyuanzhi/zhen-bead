import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function base64url(str: string): string {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createSignature(header: string, payload: string): string {
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  hmac.update(`${header}.${payload}`);
  return hmac.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function createToken(payload: { userId: string; username: string; role: 'admin' | 'user' }): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = base64url(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
  const signature = createSignature(header, payloadStr);
  return `${header}.${payloadStr}.${signature}`;
}

export function verifyToken(token: string): { userId: string; username: string; role: 'admin' | 'user' } | null {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;

    const expectedSignature = createSignature(header, payload);
    if (signature !== expectedSignature) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    
    if (data.exp && Date.now() > data.exp) {
      return null;
    }

    return { userId: data.userId, username: data.username, role: data.role };
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function generateRandomPassword(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function parseAuthHeader(authHeader: string | undefined): { token: string } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return { token: authHeader.slice(7) };
}
