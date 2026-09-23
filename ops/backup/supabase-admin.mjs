// Shared helpers for ops scripts that talk to a Supabase project with the
// service-role key. The key is read from NEVOUT_SERVICE_ROLE_KEY_FILE
// (preferred; must be chmod 600) or NEVOUT_SERVICE_ROLE_KEY — never from argv
// and never printed. These scripts run on an operator machine or a scheduled
// job, never in the browser.
import fs from "node:fs";

export function supabaseUrl(envName = "NEVOUT_SUPABASE_URL") {
  const url = process.env[envName];
  if (!url) throw new Error(`${envName} is not set (e.g. https://<project-ref>.supabase.co)`);
  return url.replace(/\/$/, "");
}

export function serviceKey(prefix = "NEVOUT_SERVICE_ROLE_KEY") {
  const file = process.env[`${prefix}_FILE`];
  if (file) {
    if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error(`${file} must be chmod 600`);
    return fs.readFileSync(file, "utf8").trim();
  }
  const key = process.env[prefix];
  if (!key) throw new Error(`${prefix}_FILE (recommended) or ${prefix} is not set`);
  return key.trim();
}

export function client({ urlEnv = "NEVOUT_SUPABASE_URL", keyPrefix = "NEVOUT_SERVICE_ROLE_KEY" } = {}) {
  const base = supabaseUrl(urlEnv);
  const key = serviceKey(keyPrefix);
  const headers = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });
  const call = async (method, path, { body, headers: h = {}, raw = false } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: headers(body && !(body instanceof Uint8Array) && typeof body !== "string" ? { "Content-Type": "application/json", ...h } : h),
      body: body && !(body instanceof Uint8Array) && typeof body !== "string" ? JSON.stringify(body) : body
    });
    if (raw) return res;
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status} ${text.slice(0, 200)}`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  };
  return { base, call };
}
