// Records By Grevo — Bunny upload proxy
// Receives video uploads from the SPA, forwards them to Bunny Storage with
// the access key kept server-side. Returns a CDN URL for sharing.

import express from 'express';
import https from 'node:https';

const {
  BUNNY_STORAGE_ZONE,
  BUNNY_STORAGE_HOST = 'storage.bunnycdn.com',
  BUNNY_ACCESS_KEY,
  BUNNY_PULL_ZONE_URL,
  UPLOAD_SECRET,
  PORT = 8080,
  ALLOWED_ORIGINS = '*',
} = process.env;

const required = {
  BUNNY_STORAGE_ZONE,
  BUNNY_ACCESS_KEY,
  BUNNY_PULL_ZONE_URL,
  UPLOAD_SECRET,
};
const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`[fatal] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const PULL_ZONE_BASE = String(BUNNY_PULL_ZONE_URL).replace(/\/$/, '');
const ALLOWED = String(ALLOWED_ORIGINS).split(',').map((s) => s.trim());
const ALLOW_ALL = ALLOWED.includes('*');

const app = express();
app.disable('x-powered-by');

// ────── CORS ──────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOW_ALL) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-upload-secret'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ────── Health ──────
app.get('/', (_req, res) => {
  res.json({
    name: 'records-by-grevo-proxy',
    status: 'ok',
    storage: { zone: BUNNY_STORAGE_ZONE, host: BUNNY_STORAGE_HOST },
    pullZone: PULL_ZONE_BASE,
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ────── Helpers ──────
function checkSecret(req, res) {
  const secret = req.headers['x-upload-secret'];
  if (!secret || secret !== UPLOAD_SECRET) {
    res.status(401).json({ ok: false, error: 'Invalid upload secret' });
    return false;
  }
  return true;
}

function sanitizeName(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 200);
}

function sanitizeFolder(input) {
  const cleaned = String(input || '')
    .replace(/\\/g, '/')
    .replace(/\.\.+/g, '')
    .replace(/[^a-zA-Z0-9._\-/]/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
  if (!cleaned) return '';
  return cleaned.endsWith('/') ? cleaned : cleaned + '/';
}

// ────── Upload (streaming PUT to Bunny) ──────
app.post('/upload', (req, res) => {
  if (!checkSecret(req, res)) return;

  const name = sanitizeName(req.query.name);
  const folder = sanitizeFolder(req.query.folder);
  if (!name) {
    return res.status(400).json({ ok: false, error: 'Missing "name" query param' });
  }

  const objectPath = `${folder}${name}`;
  const bunnyUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${objectPath}`;
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const contentLength = req.headers['content-length'];

  console.log(
    `[upload] ${objectPath} (${contentLength ? `${contentLength} B` : 'streamed'}, ${contentType})`
  );

  const proxyReq = https.request(
    bunnyUrl,
    {
      method: 'PUT',
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
      },
    },
    (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        const status = proxyRes.statusCode || 0;
        const body = Buffer.concat(chunks).toString('utf8');
        if (status >= 200 && status < 300) {
          res.json({
            ok: true,
            url: `${PULL_ZONE_BASE}/${objectPath}`,
            storagePath: `/${BUNNY_STORAGE_ZONE}/${objectPath}`,
            size: contentLength ? Number(contentLength) : undefined,
          });
        } else {
          console.warn(`[upload:fail] ${status} ${body.slice(0, 200)}`);
          res.status(status || 502).json({
            ok: false,
            error: `Bunny upload failed: ${status}`,
            details: body.slice(0, 500),
          });
        }
      });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[upload:proxy-error]', err);
    if (!res.headersSent) res.status(502).json({ ok: false, error: err.message });
  });
  req.on('error', (err) => {
    console.error('[upload:req-error]', err);
    proxyReq.destroy(err);
  });
  req.on('aborted', () => {
    console.warn('[upload:aborted]');
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
});

// ────── Delete from Bunny ──────
app.delete('/file', (req, res) => {
  if (!checkSecret(req, res)) return;

  const folder = sanitizeFolder(req.query.folder);
  const name = sanitizeName(req.query.name);
  if (!name) {
    return res.status(400).json({ ok: false, error: 'Missing "name" query param' });
  }
  const objectPath = `${folder}${name}`;
  const bunnyUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${objectPath}`;

  const r = https.request(
    bunnyUrl,
    { method: 'DELETE', headers: { AccessKey: BUNNY_ACCESS_KEY } },
    (proxyRes) => {
      const status = proxyRes.statusCode || 0;
      let body = '';
      proxyRes.on('data', (c) => (body += c));
      proxyRes.on('end', () => {
        if (status >= 200 && status < 300) {
          res.json({ ok: true });
        } else {
          res.status(status || 502).json({ ok: false, error: body.slice(0, 200) });
        }
      });
    }
  );
  r.on('error', (err) => res.status(502).json({ ok: false, error: err.message }));
  r.end();
});

app.listen(Number(PORT), () => {
  console.log(
    `[records-by-grevo-proxy] listening on :${PORT} → ${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}`
  );
});
