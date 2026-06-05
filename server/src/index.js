// Records By Grevo — Bunny upload proxy (multi-tenant)
// Each upload request supplies its own Bunny credentials via headers; the
// proxy keeps only an `UPLOAD_SECRET` (shared team password) and CORS config.

import express from 'express';
import https from 'node:https';

const {
  UPLOAD_SECRET,
  PORT = 8080,
  ALLOWED_ORIGINS = '*',
} = process.env;

if (!UPLOAD_SECRET) {
  console.error('[fatal] Missing required env var: UPLOAD_SECRET');
  process.exit(1);
}

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
    'Content-Type, x-upload-secret, x-bunny-zone, x-bunny-host, x-bunny-key, x-pull-zone'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ────── Health ──────
app.get('/', (_req, res) => {
  res.json({
    name: 'records-by-grevo-proxy',
    status: 'ok',
    mode: 'multi-tenant',
    info: 'Send Bunny credentials via headers x-bunny-zone, x-bunny-host, x-bunny-key, x-pull-zone',
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

function readBunnyCreds(req, res) {
  const zone = String(req.headers['x-bunny-zone'] || '').trim();
  const host = String(req.headers['x-bunny-host'] || 'storage.bunnycdn.com').trim();
  const key = String(req.headers['x-bunny-key'] || '').trim();
  let pull = String(req.headers['x-pull-zone'] || '').trim().replace(/\/+$/, '');
  // Ensure scheme — user may have provided bare hostname
  if (pull && !/^https?:\/\//i.test(pull)) pull = 'https://' + pull;

  if (!zone || !key || !pull) {
    res.status(400).json({
      ok: false,
      error:
        'Missing Bunny credentials. Required headers: x-bunny-zone, x-bunny-key, x-pull-zone',
    });
    return null;
  }
  return { zone, host, key, pull };
}

// Replace Czech / accented characters with ASCII fallback, then strip what
// remains unsafe for URLs. Spaces become underscores.
function transliterate(s) {
  const map = {
    á: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', í: 'i', ň: 'n', ó: 'o',
    ř: 'r', š: 's', ť: 't', ú: 'u', ů: 'u', ý: 'y', ž: 'z',
    Á: 'A', Č: 'C', Ď: 'D', É: 'E', Ě: 'E', Í: 'I', Ň: 'N', Ó: 'O',
    Ř: 'R', Š: 'S', Ť: 'T', Ú: 'U', Ů: 'U', Ý: 'Y', Ž: 'Z',
  };
  return s.replace(/[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, (c) => map[c] || c);
}

function sanitizeName(input) {
  const base = String(input || '').replace(/\\/g, '/').split('/').pop();
  const ascii = transliterate(base);
  return ascii
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200) || 'recording';
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
  const creds = readBunnyCreds(req, res);
  if (!creds) return;

  const name = sanitizeName(req.query.name);
  const folder = sanitizeFolder(req.query.folder);
  if (!name) {
    return res.status(400).json({ ok: false, error: 'Missing "name" query param' });
  }

  const objectPath = `${folder}${name}`;
  const bunnyUrl = `https://${creds.host}/${creds.zone}/${objectPath}`;
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const contentLength = req.headers['content-length'];

  console.log(
    `[upload] ${creds.zone}/${objectPath} (${contentLength ? `${contentLength} B` : 'streamed'}, ${contentType})`
  );

  const proxyReq = https.request(
    bunnyUrl,
    {
      method: 'PUT',
      headers: {
        AccessKey: creds.key,
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
            url: `${creds.pull}/${objectPath}`,
            storagePath: `/${creds.zone}/${objectPath}`,
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

// ────── Delete (per-user Bunny creds) ──────
app.delete('/file', (req, res) => {
  if (!checkSecret(req, res)) return;
  const creds = readBunnyCreds(req, res);
  if (!creds) return;

  const folder = sanitizeFolder(req.query.folder);
  const name = sanitizeName(req.query.name);
  if (!name) {
    return res.status(400).json({ ok: false, error: 'Missing "name" query param' });
  }
  const objectPath = `${folder}${name}`;
  const bunnyUrl = `https://${creds.host}/${creds.zone}/${objectPath}`;

  const r = https.request(
    bunnyUrl,
    { method: 'DELETE', headers: { AccessKey: creds.key } },
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
    `[records-by-grevo-proxy] listening on :${PORT} (multi-tenant mode)`
  );
});
