#!/usr/bin/env node
// NevOut Meds backup encryption: authenticated, streaming, no dependencies.
//
//   node nvcrypt.mjs encrypt <plain-in> <cipher-out>
//   node nvcrypt.mjs decrypt <cipher-in> <plain-out>
//
// Format "NVBK1": magic(5) | kdf-salt(16) | iv(12) | ciphertext | gcm-tag(16)
//   key = scrypt(passphrase, salt, N=2^15, r=8, p=1) -> 32 bytes, AES-256-GCM.
// GCM authenticates the whole file: a wrong passphrase, truncation or any
// tampering makes decryption fail (non-zero exit) instead of producing garbage.
//
// The passphrase is read from NEVOUT_BACKUP_PASSPHRASE_FILE (preferred; must
// not be group/world-readable) or NEVOUT_BACKUP_PASSPHRASE. It is never taken
// from argv, so it doesn't appear in process listings.
import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("NVBK1");
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function passphrase() {
  const file = process.env.NEVOUT_BACKUP_PASSPHRASE_FILE;
  if (file) {
    const st = fs.statSync(file);
    if ((st.mode & 0o077) !== 0) throw new Error(`${file} must not be readable by group/others (chmod 600)`);
    const p = fs.readFileSync(file, "utf8").replace(/\r?\n$/, "");
    if (p.length < 20) throw new Error("backup passphrase must be at least 20 characters");
    return p;
  }
  const p = process.env.NEVOUT_BACKUP_PASSPHRASE;
  if (!p) throw new Error("set NEVOUT_BACKUP_PASSPHRASE_FILE (recommended) or NEVOUT_BACKUP_PASSPHRASE");
  if (p.length < 20) throw new Error("backup passphrase must be at least 20 characters");
  return p;
}

const deriveKey = (salt) => crypto.scryptSync(passphrase(), salt, 32, SCRYPT);

async function encrypt(inPath, outPath) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(salt), iv);
  const out = fs.createWriteStream(outPath, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(fs.createReadStream(inPath), cipher, out, { end: false }).catch(async (e) => { out.destroy(); throw e; });
  out.end(cipher.getAuthTag());
  await new Promise((res, rej) => { out.on("finish", res); out.on("error", rej); });
}

async function decrypt(inPath, outPath) {
  const size = fs.statSync(inPath).size;
  const head = MAGIC.length + 16 + 12;
  if (size < head + 16) throw new Error("file too small to be a NevOut Meds backup");
  const fd = fs.openSync(inPath, "r");
  const header = Buffer.alloc(head);
  fs.readSync(fd, header, 0, head, 0);
  const tag = Buffer.alloc(16);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not a NevOut Meds backup (bad magic)");
  const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = header.subarray(MAGIC.length + 16, head);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(salt), iv);
  decipher.setAuthTag(tag);
  const tmp = `${outPath}.partial`;
  try {
    await pipeline(fs.createReadStream(inPath, { start: head, end: size - 17 }), decipher, fs.createWriteStream(tmp, { mode: 0o600 }));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw new Error("decryption failed: wrong passphrase, or the file is corrupt or was modified");
  }
  fs.renameSync(tmp, outPath);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "encrypt" && a && b) await encrypt(a, b);
  else if (cmd === "decrypt" && a && b) await decrypt(a, b);
  else { console.error("usage: nvcrypt.mjs encrypt|decrypt <in> <out>"); process.exit(64); }
} catch (e) {
  console.error(`nvcrypt: ${e.message}`);
  process.exit(1);
}
