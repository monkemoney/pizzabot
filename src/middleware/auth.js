'use strict';

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Default tenant for this deployment (single-tenant mode)
const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

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

/** Sign a dashboard token — includes the caller's tenant_id */
function signDashboard(username, role, tenantId = DEFAULT_TENANT_ID) {
  return sign({
    username,
    role,
    tenant_id: tenantId,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  });
}

/** Express middleware — require valid token; attaches req.user (includes tenant_id) */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace(/^Bearer\s+/i, '');
  const user   = verify(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  // Ensure tenant_id is always set (fallback for old tokens)
  if (!user.tenant_id) user.tenant_id = DEFAULT_TENANT_ID;
  req.user = user;
  next();
}

/** Require admin role */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'vendor') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

/** Require vendor role (platform owner — no tenant restriction) */
function requireVendor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Forbidden — vendor only' });
    next();
  });
}

module.exports = { sign, verify, signDashboard, requireAuth, requireAdmin, requireVendor, DEFAULT_TENANT_ID };
