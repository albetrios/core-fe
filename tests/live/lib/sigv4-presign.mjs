/**
 * Minimal AWS SigV4 S3 presigner.
 *
 * Presigning is pure crypto — it makes NO network call and never transmits the
 * secret key. It produces the same shape of URL core-be hands the browser for a
 * direct-to-S3 upload, so the frontend probe exercises the real upload path
 * without needing the backend running.
 */
import { createHash, createHmac } from 'node:crypto';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

/** RFC3986 encoding — S3 requires the stricter form (`!'()*` escaped too). */
function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Object keys keep their `/` separators; each segment is encoded individually. */
const encodeKeyPath = (key) => key.split('/').map(encodeRfc3986).join('/');

function signingKey({ secretAccessKey, dateStamp, region }) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

/**
 * Build a presigned S3 URL.
 *
 * @param {{method:string,bucket:string,region:string,key:string,expiresIn?:number}} input
 * @returns {string} a fully-signed https URL valid for `expiresIn` seconds
 */
export function presignS3Url({ method, bucket, region, key, expiresIn = 600 }) {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are required to presign');
  }
  if (!bucket) throw new Error('S3_BUCKET is required to presign');

  const now = new Date();
  const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15)}Z`;
  const dateStamp = amzDate.slice(0, 8);

  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = `/${encodeKeyPath(key)}`;
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const query = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQueryString = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
    .join('&');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = createHmac(
    'sha256',
    signingKey({ secretAccessKey, dateStamp, region }),
  )
    .update(stringToSign)
    .digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
