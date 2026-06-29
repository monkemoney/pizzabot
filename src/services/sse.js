'use strict';

// Per-tenant SSE connections: Map<tenantId, Set<res>>
const _clients = new Map();

function _getClients(tenantId) {
  if (!_clients.has(tenantId)) _clients.set(tenantId, new Set());
  return _clients.get(tenantId);
}

/** Register an SSE response object for a tenant. Returns cleanup function. */
function subscribe(tenantId, res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const set = _getClients(tenantId);
  set.add(res);

  // Keepalive every 25s to prevent proxy/Render idle timeout
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  return () => {
    clearInterval(ping);
    set.delete(res);
  };
}

/** Send a named event + JSON data to all connections for a tenant. */
function broadcast(tenantId, event, data) {
  const set = _getClients(tenantId);
  if (!set.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(msg); } catch { set.delete(res); }
  }
}

module.exports = { subscribe, broadcast };
