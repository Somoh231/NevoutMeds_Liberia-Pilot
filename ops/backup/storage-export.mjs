#!/usr/bin/env node
// Copies every Supabase Storage object (all buckets) to a local directory,
// preserving bucket names and tenant paths (<pharmacy_id>/<file>), and writes
// storage-manifest.json with everything needed to restore: bucket settings and,
// per object, path, size, content type, cache control and SHA-256.
//
//   node storage-export.mjs <out-dir>
// Env: NEVOUT_SUPABASE_URL, NEVOUT_SERVICE_ROLE_KEY_FILE (or NEVOUT_SERVICE_ROLE_KEY)
//
// Database dumps do NOT contain these files; this is the only thing that does.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { client } from "./supabase-admin.mjs";

const out = process.argv[2];
if (!out) { console.error("usage: storage-export.mjs <out-dir>"); process.exit(64); }
const { call } = client();

async function listAll(bucket, prefix = "") {
  const found = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await call("POST", `/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      body: { prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }
    });
    for (const e of page) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) found.push(...(await listAll(bucket, full))); // a folder
      else found.push({ path: full, meta: e.metadata ?? {}, created_at: e.created_at, updated_at: e.updated_at });
    }
    if (page.length < 1000) break;
  }
  return found;
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const manifest = { format: "nevoutmeds-storage-v1", generated_at: new Date().toISOString(), buckets: [], objects: [] };
fs.mkdirSync(path.join(out, "objects"), { recursive: true, mode: 0o700 });

const buckets = await call("GET", "/storage/v1/bucket");
for (const b of buckets) {
  manifest.buckets.push({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit ?? null, allowed_mime_types: b.allowed_mime_types ?? null });
  for (const o of await listAll(b.id)) {
    const res = await call("GET", `/storage/v1/object/authenticated/${encodeURIComponent(b.id)}/${encodePath(o.path)}`, { raw: true });
    if (!res.ok) throw new Error(`download ${b.id}/${o.path} failed: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const dest = path.join(out, "objects", b.id, ...o.path.split("/"));
    if (!dest.startsWith(path.join(out, "objects") + path.sep)) throw new Error(`refusing unsafe object path ${o.path}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    fs.writeFileSync(dest, data, { mode: 0o600 });
    manifest.objects.push({
      bucket: b.id,
      path: o.path,
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
      content_type: o.meta.mimetype ?? res.headers.get("content-type") ?? "application/octet-stream",
      cache_control: o.meta.cacheControl ?? null,
      created_at: o.created_at ?? null,
      updated_at: o.updated_at ?? null
    });
  }
}
fs.writeFileSync(path.join(out, "storage-manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
const bytes = manifest.objects.reduce((t, o) => t + o.size, 0);
console.log(JSON.stringify({ buckets: manifest.buckets.length, objects: manifest.objects.length, bytes }));
