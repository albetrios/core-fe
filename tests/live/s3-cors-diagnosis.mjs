/**
 * Separates two very different S3 failures:
 *   (a) the presigned URL / credentials are wrong  → server-side PUT fails too
 *   (b) the presigned URL is fine, the BROWSER is blocked by bucket CORS
 *
 * Runs server-side (no browser, so no CORS enforcement) and additionally issues a
 * CORS preflight to show exactly what the bucket does or does not advertise.
 */
import { presignS3Url } from './lib/sigv4-presign.mjs';

const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION ?? 'us-east-1';
const key = `fe-live/cors-diag-${Date.now()}.png`;
const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ORIGIN = 'http://localhost:4599';

const out = [];
const put = presignS3Url({ method: 'PUT', bucket, region, key, expiresIn: 600 });
const get = presignS3Url({ method: 'GET', bucket, region, key, expiresIn: 600 });
const del = presignS3Url({ method: 'DELETE', bucket, region, key, expiresIn: 600 });

// 1. Server-side PUT — no CORS involved.
const putRes = await fetch(put, {
  method: 'PUT',
  headers: { 'content-type': 'image/png' },
  body,
});
out.push({
  step: 'server-side PUT (no CORS)',
  status: putRes.status,
  ok: putRes.ok,
  etag: putRes.headers.get('etag'),
});

// 2. CORS preflight exactly as the browser sent it.
const preflight = await fetch(put, {
  method: 'OPTIONS',
  headers: {
    Origin: ORIGIN,
    'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'content-type',
  },
});
out.push({
  step: 'CORS preflight (OPTIONS)',
  status: preflight.status,
  allowOrigin: preflight.headers.get('access-control-allow-origin'),
  allowMethods: preflight.headers.get('access-control-allow-methods'),
  allowHeaders: preflight.headers.get('access-control-allow-headers'),
  body: (await preflight.text()).slice(0, 200),
});

// 3. Server-side readback proves the object really landed.
const getRes = await fetch(get);
const bytes = new Uint8Array(await getRes.arrayBuffer());
out.push({
  step: 'server-side GET readback',
  status: getRes.status,
  contentType: getRes.headers.get('content-type'),
  byteLength: bytes.byteLength,
  byteMatch: JSON.stringify([...bytes]) === JSON.stringify([...body]),
});

// 4. Cleanup — leave no residue.
const delRes = await fetch(del, { method: 'DELETE' });
const after = await fetch(get);
out.push({
  step: 'cleanup DELETE + verify',
  deleteStatus: delRes.status,
  getAfterDelete: after.status,
  removed: after.status === 404 || after.status === 403,
});

console.log(JSON.stringify({ bucket, region, key, results: out }, null, 2));
