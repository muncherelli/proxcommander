#!/usr/bin/env node
// Dev-only CORS proxy so the web build can reach Proxmox VE, which sends no
// CORS headers. Requests look like
//   http://127.0.0.1:8787/<encodeURIComponent("https://host:8006")>/api2/json/...
// matching apiBase() in src/proxmox/client.ts.
//
// PVE_PROXY_PORT      listen port (default 8787)
// PVE_PROXY_INSECURE  "1" to accept self-signed PVE certificates

import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.PVE_PROXY_PORT ?? 8787);
const INSECURE = process.env.PVE_PROXY_INSECURE === '1';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const REQUEST_HEADERS = ['authorization', 'csrfpreventiontoken', 'content-type', 'content-length', 'accept'];
const RESPONSE_HEADERS = ['content-type', 'content-length'];

function pick(headers, names) {
  return Object.fromEntries(names.filter((name) => headers[name] != null).map((name) => [name, headers[name]]));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, CSRFPreventionToken, Content-Type, Accept',
    'Access-Control-Max-Age': '600',
    'Access-Control-Expose-Headers': 'X-PVE-Proxy-Error',
    Vary: 'Origin',
  };
}

function parseTarget(url) {
  const match = /^\/([^/]+)(\/api2\/json\/[^#]*)$/.exec(url ?? '');
  if (!match) return null;
  try {
    const origin = new URL(decodeURIComponent(match[1]));
    if (origin.protocol !== 'https:') return null;
    // Resolve dot segments (including encoded ones) so the path can't climb out of /api2/json/.
    const resolved = new URL(match[2], 'https://pve.invalid');
    if (!resolved.pathname.startsWith('/api2/json/') || /%2e/i.test(resolved.pathname)) return null;
    const path = resolved.pathname + resolved.search;
    return { hostname: origin.hostname.replace(/^\[|\]$/g, ''), port: Number(origin.port || 443), path };
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  // Only the local dev app may use this proxy: no other site, no rebinding.
  if (!LOCAL_HOST.test(req.headers.host ?? '') || !origin || !LOCAL_ORIGIN.test(origin)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('forbidden');
    return;
  }
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  const target = parseTarget(req.url);
  if (!target) {
    res.writeHead(400, { ...cors, 'Content-Type': 'text/plain' }).end('expected /<encoded https origin>/api2/json/...');
    return;
  }

  const upstream = https.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method: req.method,
      headers: pick(req.headers, REQUEST_HEADERS),
      rejectUnauthorized: !INSECURE,
    },
    (upstreamRes) => {
      // PVE puts the human-readable error in the status line; keep it.
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage, {
        ...pick(upstreamRes.headers, RESPONSE_HEADERS),
        ...cors,
      });
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    const message = error.message || error.code || String(error);
    // Marks the proxy's own failure so the app treats it as an unreachable endpoint.
    if (!res.headersSent) {
      res.writeHead(502, message, { ...cors, 'Content-Type': 'text/plain', 'X-PVE-Proxy-Error': 'unreachable' });
    }
    res.end(message);
  });
  req.pipe(upstream);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PVE dev proxy on http://127.0.0.1:${PORT}`);
  if (INSECURE) console.warn('WARNING: PVE_PROXY_INSECURE=1 — accepting any TLS certificate from PVE hosts');
});
