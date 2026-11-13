'use strict';

/*
 * VECTOR VP-7000 radio relay.
 * Zero dependencies: HTTP + Server-Sent Events.
 *
 *   node server.js            -> http://localhost:8080
 *   PORT=3000 node server.js
 *   HOST=0.0.0.0 node server.js   (default: reachable on your LAN)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

/** every connected listener (SSE response) */
const listeners = new Set();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function broadcast(text) {
  const frame = 'data: ' + text + '\n\n';
  for (const res of listeners) {
    try { res.write(frame); } catch (err) { /* dropped */ }
  }
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    res.writeHead(400); res.end('bad request'); return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  /* ---------- receive audio: POST /send ---------- */
  if (req.method === 'POST' && pathname.endsWith('/send')) {
    let body = '';
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      body += chunk;
      if (body.length > 400000) { aborted = true; req.destroy(); }
    });

    req.on('end', () => {
      if (aborted) return;
      if (body) {
        try {
          JSON.parse(body);       // validate before rebroadcasting
          broadcast(body);
        } catch (err) { /* ignore malformed */ }
      }
      res.writeHead(204);
      res.end();
    });

    req.on('error', () => {});
    return;
  }

  /* ---------- listen: GET /events ---------- */
  if (req.method === 'GET' && pathname.endsWith('/events')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': linked\n\n');
    listeners.add(res);

    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (err) {}
    }, 15000);

    const cleanup = () => {
      clearInterval(ping);
      listeners.delete(res);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    req.on('aborted', cleanup);
    return;
  }

  /* ---------- static files ---------- */
  const rel = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(ROOT, path.normalize(rel).replace(/^[/\\]+/, ''));

  if (!full.startsWith(ROOT + path.sep) && full !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); res.end('forbidden'); return;
  }

  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log('radio relay listening on http://localhost:' + PORT);
  if (HOST === '0.0.0.0') {
    console.log('also reachable on your LAN at http://<this-computer-ip>:' + PORT);
  }
});
