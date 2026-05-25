'use strict';

process.env.JWT_SECRET = 'test-secret-key';
process.env.TENANT_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';

const {
  sign, verify, signDashboard,
  requireAuth, requireAdmin, requireVendor,
  DEFAULT_TENANT_ID,
} = require('../src/middleware/auth');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json   = jest.fn().mockReturnValue(r);
  return r;
}
function bearerReq(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

// ── sign / verify ─────────────────────────────────────────────────────────────
describe('sign + verify', () => {
  test('round-trips payload correctly', () => {
    const tok = sign({ username: 'admin', role: 'admin', exp: Date.now() + 60000 });
    const p   = verify(tok);
    expect(p.username).toBe('admin');
    expect(p.role).toBe('admin');
  });

  test('returns null on tampered signature', () => {
    const tok = sign({ role: 'admin', exp: Date.now() + 60000 });
    const [b64, realSig] = tok.split('.');
    // Flip first char — same length, wrong value
    const wrongChar = realSig[0] === 'A' ? 'B' : 'A';
    expect(verify(`${b64}.${wrongChar}${realSig.slice(1)}`)).toBeNull();
  });

  test('returns null on expired token', () => {
    const tok = sign({ role: 'admin', exp: Date.now() - 1 });
    expect(verify(tok)).toBeNull();
  });

  test('returns null for null / empty / garbage', () => {
    expect(verify(null)).toBeNull();
    expect(verify('')).toBeNull();
    expect(verify('notvalid')).toBeNull();
    expect(verify('a.b.c')).toBeNull(); // 3-part JWT not our format
  });
});

// ── signDashboard ─────────────────────────────────────────────────────────────
describe('signDashboard', () => {
  test('encodes username, role, tenant_id', () => {
    const tok = signDashboard('alice', 'admin', 'tenant-xyz');
    const p   = verify(tok);
    expect(p.username).toBe('alice');
    expect(p.role).toBe('admin');
    expect(p.tenant_id).toBe('tenant-xyz');
  });

  test('uses DEFAULT_TENANT_ID when omitted', () => {
    const p = verify(signDashboard('mgr', 'manager'));
    expect(p.tenant_id).toBe(DEFAULT_TENANT_ID);
  });

  test('expires in ~24 hours', () => {
    const p = verify(signDashboard('admin', 'admin'));
    const ms = p.exp - Date.now();
    expect(ms).toBeGreaterThan(23 * 3600 * 1000);
    expect(ms).toBeLessThan(25 * 3600 * 1000);
  });
});

// ── requireAuth ───────────────────────────────────────────────────────────────
describe('requireAuth', () => {
  test('calls next() with valid token and attaches req.user', () => {
    const req  = bearerReq(signDashboard('admin', 'admin', 'tenant-abc'));
    const next = jest.fn();
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.role).toBe('admin');
    expect(req.user.tenant_id).toBe('tenant-abc');
  });

  test('returns 401 with no Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 401 with invalid token', () => {
    const res = mockRes();
    // Use a wrong-length signature — auth.js now catches RangeError and returns null
    requireAuth(bearerReq('garbage.shortbadsig'), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('falls back to DEFAULT_TENANT_ID for legacy tokens without tenant_id', () => {
    const tok = sign({ username: 'old', role: 'admin', exp: Date.now() + 60000 });
    const req = bearerReq(tok);
    requireAuth(req, mockRes(), jest.fn());
    expect(req.user.tenant_id).toBe(DEFAULT_TENANT_ID);
  });
});

// ── requireAdmin ──────────────────────────────────────────────────────────────
describe('requireAdmin', () => {
  test('allows admin role', () => {
    const req  = bearerReq(signDashboard('a', 'admin'));
    const next = jest.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('allows vendor role (superset)', () => {
    const req  = bearerReq(signDashboard('v', 'vendor'));
    const next = jest.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('blocks manager with 403', () => {
    const res = mockRes();
    requireAdmin(bearerReq(signDashboard('m', 'manager')), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── requireVendor ─────────────────────────────────────────────────────────────
describe('requireVendor', () => {
  test('allows vendor role', () => {
    const req  = bearerReq(signDashboard('v', 'vendor'));
    const next = jest.fn();
    requireVendor(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('blocks admin with 403', () => {
    const res = mockRes();
    requireVendor(bearerReq(signDashboard('a', 'admin')), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('blocks manager with 403', () => {
    const res = mockRes();
    requireVendor(bearerReq(signDashboard('m', 'manager')), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── tenant isolation ──────────────────────────────────────────────────────────
describe('tenant isolation via JWT', () => {
  test('two tokens carry distinct tenant_ids that cannot be confused', () => {
    const pA = verify(signDashboard('admin-a', 'admin', 'tenant-AAAA'));
    const pB = verify(signDashboard('admin-b', 'admin', 'tenant-BBBB'));
    expect(pA.tenant_id).toBe('tenant-AAAA');
    expect(pB.tenant_id).toBe('tenant-BBBB');
    expect(pA.tenant_id).not.toBe(pB.tenant_id);
  });

  test('requireAuth attaches the correct tenant_id from token to req.user', () => {
    const tenantId = 'cccc-1111-2222-3333';
    const req = bearerReq(signDashboard('u', 'admin', tenantId));
    requireAuth(req, mockRes(), jest.fn());
    expect(req.user.tenant_id).toBe(tenantId);
  });
});
