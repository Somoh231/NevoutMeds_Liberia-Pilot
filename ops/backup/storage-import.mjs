#!/usr/bin/env node
// Restores Storage objects exported by storage-export.mjs into a Supabase
// project: creates missing buckets with their recorded settings, uploads every
// object to its original tenant path with its content type, then downloads
// each one again and checks its SHA-256 against the manifest.
//
//   node storage-import.mjs <export-dir> [--overwrite]
// Env (the TARGET project): NEVOUT_RESTORE_SUPABASE_URL,
//   NEVOUT_RESTORE_SERVICE_ROLE_KEY_FILE (or NEVOUT_RESTORE_SERVICE_ROLE_KEY)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { client } from "./supabase-admin.mjs";

const dir = process.argv[2];
const overwrite = process.argv.includes("--overwrite");
if (!dir) { console.error("usage: storage-import.mjs <export-dir> [--overwrite]"); process.exit(64); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "storage-manifest.json"), "utf8"));
const { call } = client({ urlEnv: "NEVOUT_RESTORE_SUPABASE_URL", keyPrefix: "NEVOUT_RESTORE_SERVICE_ROLE_KEY" });
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

const existing = new Set((await call("GET", "/storage/v1/bucket")).map((b) => b.id));
for (const b of manifest.buckets) {
  if (existing.has(b.id)) continue;
  await call("POST", "/storage/v1/bucket", { body: { id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types } });
  console.log(`created bucket ${b.id}`);
}

let uploaded = 0, verified = 0;
for (const o of manifest.objects) {
  const data = fs.readFileSync(path.join(dir, "objects", o.bucket, ...o.path.split("/")));
  if (crypto.createHash("sha256").update(data).digest("hex") !== o.sha256) throw new Error(`backup copy of ${o.bucket}/${o.path} does not match its manifest checksum`);
  const res = await call("POST", `/storage/v1/object/${encodeURIComponent(o.bucket)}/${encodePath(o.path)}`, {
    body: data,
    raw: true,
    headers: { "Content-Type": o.content_type, "x-upsert": overwrite ? "true" : "false", ...(o.cache_control ? { "Cache-Control": o.cache_control } : {}) }
  });
  if (!res.ok) throw new Error(`upload ${o.bucket}/${o.path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 160)}${res.status === 400 || res.status === 409 ? " (already exists? use --overwrite)" : ""}`);
  uploaded++;
  const back = await call("GET", `/storage/v1/object/authenticated/${encodeURIComponent(o.bucket)}/${encodePath(o.path)}`, { raw: true });
  const got = Buffer.from(await back.arrayBuffer());
  if (crypto.createHash("sha256").update(got).digest("hex") !== o.sha256) throw new Error(`verification failed for ${o.bucket}/${o.path}`);
  verified++;
}
console.log(JSON.stringify({ buckets: manifest.buckets.length, uploaded, verified }));
