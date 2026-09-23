#!/usr/bin/env node
// Minimal S3-compatible client (AWS Signature V4), no dependencies.
// Works with AWS S3, Cloudflare R2, Backblaze B2 (S3 API), MinIO and Supabase
// Storage's S3 endpoint — the vendor is configuration, not code.
//
//   node s3.mjs put    <local-file> <key>
//   node s3.mjs get    <key> <local-file>
//   node s3.mjs list   [prefix]            -> one "key<TAB>size<TAB>lastModified" per line
//   node s3.mjs delete <key>
//
// Configuration (environment):
//   NEVOUT_BACKUP_S3_ENDPOINT   e.g. https://<account>.r2.cloudflarestorage.com, https://s3.eu-west-1.amazonaws.com,
//                               https://s3.us-west-004.backblazeb2.com, http://127.0.0.1:9000
//   NEVOUT_BACKUP_S3_BUCKET     bucket name
//   NEVOUT_BACKUP_S3_REGION     e.g. auto (R2), eu-west-1, us-west-004 (default: us-east-1)
//   NEVOUT_BACKUP_S3_ACCESS_KEY_ID / NEVOUT_BACKUP_S3_SECRET_ACCESS_KEY
//       (or NEVOUT_BACKUP_S3_SECRET_ACCESS_KEY_FILE, chmod 600)
//   NEVOUT_BACKUP_S3_PREFIX     optional key prefix, e.g. nevoutmeds/prod/
// Path-style addressing is used (supported by all of the above).
import crypto from "node:crypto";
import fs from "node:fs";

const env = (k, d) => process.env[k] ?? d;
function secret() {
  const f = env("NEVOUT_BACKUP_S3_SECRET_ACCESS_KEY_FILE");
  if (f) {
    if ((fs.statSync(f).mode & 0o077) !== 0) throw new Error(`${f} must be chmod 600`);
    return fs.readFileSync(f, "utf8").trim();
  }
  return env("NEVOUT_BACKUP_S3_SECRET_ACCESS_KEY");
}
const cfg = () => {
  const c = {
    endpoint: env("NEVOUT_BACKUP_S3_ENDPOINT"),
    bucket: env("NEVOUT_BACKUP_S3_BUCKET"),
    region: env("NEVOUT_BACKUP_S3_REGION", "us-east-1"),
    keyId: env("NEVOUT_BACKUP_S3_ACCESS_KEY_ID"),
    secret: secret(),
    prefix: env("NEVOUT_BACKUP_S3_PREFIX", "")
  };
  for (const [k, v] of Object.entries({ endpoint: c.endpoint, bucket: c.bucket, keyId: c.keyId, secret: c.secret })) {
    if (!v) throw new Error(`S3 destination is not configured: missing ${k} (see ops/backup/backup.env.example)`);
  }
  c.endpoint = c.endpoint.replace(/\/$/, "");
  return c;
};

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
// SigV4 needs strict RFC 3986 encoding (encodeURIComponent leaves !'()* alone).
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase());
const encodeKey = (key) => key.split("/").map(rfc3986).join("/");

async function request(method, key, { body, query = {}, payloadHash } = {}) {
  const c = cfg();
  const url = new URL(c.endpoint);
  const basePath = url.pathname.replace(/\/$/, "");
  const path = `${basePath}/${encodeURIComponent(c.bucket)}${key ? "/" + encodeKey(key) : ""}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const hash = payloadHash ?? sha256(body ?? "");
  const qs = Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`).join("&");
  const headers = { host: url.host, "x-amz-content-sha256": hash, "x-amz-date": amzDate };
  const signed = Object.keys(headers).sort();
  const canonical = [method, path, qs, signed.map((h) => `${h}:${headers[h]}\n`).join(""), signed.join(";"), hash].join("\n");
  const scope = `${date}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, date), c.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(toSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.keyId}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`;
  delete headers.host;
  const res = await fetch(`${url.origin}${path}${qs ? "?" + qs : ""}`, { method, headers, body });
  if (!res.ok && !(method === "DELETE" && res.status === 404)) {
    throw new Error(`S3 ${method} ${key || "(bucket)"} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return res;
}

const fullKey = (k) => `${cfg().prefix}${k}`;

async function put(file, key) {
  const body = fs.readFileSync(file);
  await request("PUT", fullKey(key), { body, payloadHash: sha256(body) });
  // Read back the size to confirm the object landed.
  const listed = (await list(key)).find((o) => o.key === key);
  if (!listed || listed.size !== body.length) throw new Error(`upload of ${key} could not be confirmed (size mismatch)`);
}
async function get(key, file) {
  const res = await request("GET", fullKey(key));
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()), { mode: 0o600 });
}
async function list(prefix = "") {
  const out = [];
  let token;
  do {
    const query = { "list-type": "2", prefix: fullKey(prefix) };
    if (token) query["continuation-token"] = token;
    const xml = await (await request("GET", "", { query })).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const pick = (t) => (m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) ?? [])[1];
      const full = pick("Key").replace(/&amp;/g, "&");
      // Keys are reported relative to NEVOUT_BACKUP_S3_PREFIX, like the other commands take them.
      out.push({ key: full.slice(cfg().prefix.length), size: Number(pick("Size")), lastModified: pick("LastModified") });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) ?? [])[1] : undefined;
  } while (token);
  return out;
}
const del = (key) => request("DELETE", fullKey(key));

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "put" && a && b) await put(a, b);
  else if (cmd === "get" && a && b) await get(a, b);
  else if (cmd === "list") for (const o of await list(a ?? "")) console.log(`${o.key}\t${o.size}\t${o.lastModified}`);
  else if (cmd === "delete" && a) await del(a);
  else { console.error("usage: s3.mjs put <file> <key> | get <key> <file> | list [prefix] | delete <key>"); process.exit(64); }
} catch (e) {
  console.error(`s3: ${e.message}`);
  process.exit(1);
}
