/**
 * Fails (exit 1) if any locale is missing a key present in en-IN, or if a
 * [data-i18n] key used in the popup HTML has no en-IN entry (MNT-3).
 *
 *   node scripts/check-i18n.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EN_ONLY } from "./build-i18n.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(HERE, "..");

const ctx = {};
ctx.globalThis = ctx;
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "src/config/i18n.js"), "utf8"), ctx);
const dicts = ctx.ConsentWiseI18n.dictionaries;

const en = Object.keys(dicts["en-IN"]);
let failed = false;

// 1. Parity
for (const [locale, dict] of Object.entries(dicts)) {
  if (locale === "en-IN") continue;
  const missing = en.filter((k) => !(k in dict));
  if (missing.length) {
    failed = true;
    console.error(`✗ ${locale} missing ${missing.length}: ${missing.join(", ")}`);
  }
}

// 2. Untranslated (value equals the en-IN value) outside the allowlist
for (const [locale, dict] of Object.entries(dicts)) {
  if (locale === "en-IN") continue;
  const same = en.filter((k) => !EN_ONLY.has(k) && dict[k] === dicts["en-IN"][k] && /[a-z]/i.test(String(dict[k])));
  if (same.length) {
    console.warn(`! ${locale} still English for ${same.length}: ${same.slice(0, 12).join(", ")}${same.length > 12 ? "…" : ""}`);
  }
}

// 3. Every data-i18n key used in HTML exists in en-IN
const html = fs.readFileSync(path.join(root, "src/popup/popup.html"), "utf8");
const used = new Set();
for (const m of html.matchAll(/data-i18n(?:-placeholder|-on|-off)?="([^"]+)"/g)) used.add(m[1]);
const unknown = [...used].filter((k) => !(k in dicts["en-IN"]));
if (unknown.length) {
  failed = true;
  console.error(`✗ HTML uses unknown i18n keys: ${unknown.join(", ")}`);
}

if (failed) {
  console.error("\ni18n check failed.");
  process.exit(1);
}
console.log(`✓ i18n ok — ${en.length} keys, ${Object.keys(dicts).length} locales`);
