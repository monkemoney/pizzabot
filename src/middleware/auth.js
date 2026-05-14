'use strict';

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/** Sign a payload → token string */
function sign(payload) {
  const data = JSON.stringify(payload);
  const b64  = Buffer.from(data).toString('base64url');
  const sig  = crypto.createHmac('sha256', JWT_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

/** Verify token → payload or null */
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(b64).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

/** Express middleware — require valid token; attaches req.user */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace(/^Bearer\s+/i, '');
  const user   = verify(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

/** Require admin role */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

module.exports = { sign, verify, requireAuth, requireAdmin };
