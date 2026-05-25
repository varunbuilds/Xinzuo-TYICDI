#!/usr/bin/env node
/*
 * Push the Liquid theme to your dev store via Admin REST Asset API.
 *
 * Usage:
 *   node scripts/push-theme.mjs              # dry-run (lists files, doesn't upload)
 *   node scripts/push-theme.mjs --write      # upload + publish theme
 *
 * Uses 4-way concurrency. Total time: ~90 seconds for the full theme.
 *
 * Reads .env: SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN.
 * The token needs `read_themes, write_themes` scope.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const CONCURRENCY = 4;

const envPath = path.join(process.cwd(), '.env');
if (!existsSync(envPath)) { console.error('No .env in CWD'); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const STORE = env.SHOPIFY_STORE_URL;
const TOKEN = env.SHOPIFY_ACCESS_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN'); process.exit(1); }

const hostname = STORE.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
if (!hostname.endsWith('.myshopify.com')) { console.error('REFUSED: not *.myshopify.com'); process.exit(1); }
if (/^xinzuo\.com\.au$/i.test(hostname)) { console.error('REFUSED: production custom domain'); process.exit(1); }

const BASE = `https://${hostname}`;
const API = `${BASE}/admin/api/2024-10`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, endpoint, body) {
  while (true) {
    const r = await fetch(`${API}/${endpoint}`, {
      method,
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) {
      await sleep(parseFloat(r.headers.get('retry-after') || '2') * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`${method} ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

const THEME_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const TEXT_EXTS = new Set(['.liquid', '.json', '.css', '.js', '.svg', '.txt', '.md', '.scss']);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Upload in dependency order: leaf files first, then files that reference them.
// Phase 1: assets, blocks, snippets, sections (the building blocks)
// Phase 2: layout, config, locales (consume phase 1 sections)
// Phase 3: templates (consume sections defined in phase 1, layouts in phase 2)
const PHASE_ORDER = {
  assets: 1, blocks: 1, snippets: 1, sections: 1,
  layout: 2, config: 2, locales: 2,
  templates: 3,
};

const files = [];
for (const d of THEME_DIRS) {
  for (const full of walk(d)) {
    const rel = full.replace(/\\/g, '/');
    const ext = path.extname(rel).toLowerCase();
    const top = rel.split('/')[0];
    files.push({ key: rel, full, isText: TEXT_EXTS.has(ext), phase: PHASE_ORDER[top] ?? 99 });
  }
}
files.sort((a, b) => a.phase - b.phase);
console.log(`Theme: ${files.length} files (3 dependency phases)`);

if (!WRITE) {
  const byDir = {};
  for (const f of files) { const top = f.key.split('/')[0]; byDir[top] = (byDir[top] ?? 0) + 1; }
  console.log('By directory:', byDir);
  console.log(`\nDRY RUN — pass --write to upload to ${hostname}`);
  process.exit(0);
}

// --- Create theme ---
const startedAt = Date.now();
console.log(`Creating theme on ${hostname}...`);
const themeName = `xinzuo-clone-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
const created = await api('POST', 'themes.json', { theme: { name: themeName, role: 'unpublished' } });
const themeId = created.theme.id;
console.log(`Theme id=${themeId} name=${themeName}`);

// --- Build ref-rewrite table from media-manifest.json (produced by export-xinzuo-media.mjs
//     and bundled with the snapshot repo). Maps origRef (e.g. shopify://shop_images/foo.png)
//     to newRef (e.g. shopify://shop_images/foo.webp) after local webp conversion.
const manifestPath = path.join(process.cwd(), 'media-manifest.json');
const refMap = new Map();
if (existsSync(manifestPath)) {
  const mf = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  for (const e of mf.files) refMap.set(e.origRef, e.newRef);
  console.log(`Loaded media-manifest: ${refMap.size} ref rewrites`);
} else {
  console.log('No media-manifest.json — image refs will be scrubbed.');
}

// Rewrite theme JSON: rewrite shop_images refs, scrub video/file refs, REMOVE app blocks.
// App blocks (shopify://apps/...) can't be scrubbed to "" because block.type can't be empty;
// they must be structurally removed from blocks{} and block_order[].
//
// Parse the JSON, walk it recursively, then re-serialize. This is safer than regex for
// nested data and avoids the orphan-scrub-undoing-rewrites trap.
// Sentinel: any value rewritten to this marker is then *removed* from its parent in
// rewriteImageRefsInJson (we delete the setting key entirely rather than leaving "",
// because some setting types — e.g. `video` — fail validation on empty strings).
const DELETE = Symbol('delete-setting');

function rewriteImageRefValue(v) {
  if (typeof v !== 'string') return v;
  // shopify://shop_images/X or shopify://shop_files/X → manifest newRef or DELETE
  let m = v.match(/^shopify:\/\/(shop_images|shop_files)\/(.+)$/);
  if (m) {
    const orig = `shopify://${m[1]}/${m[2]}`;
    return refMap.get(orig) ?? DELETE;
  }
  // shopify://files/* → DELETE (videos and other ad-hoc uploaded files we don't ship)
  if (v.startsWith('shopify://files/')) return DELETE;
  return v;
}

function isAppType(t) {
  return typeof t === 'string' && t.startsWith('shopify://apps/');
}

// Remove app-block entries from a `blocks` object and its sibling `block_order` array.
// Mutates in place. Recurses into nested `blocks` (a block can contain its own blocks).
function pruneAppBlocks(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) pruneAppBlocks(item); return; }
  if (node.blocks && typeof node.blocks === 'object' && !Array.isArray(node.blocks)) {
    const removed = [];
    for (const [key, val] of Object.entries(node.blocks)) {
      if (val && typeof val === 'object' && isAppType(val.type)) {
        removed.push(key);
        delete node.blocks[key];
      } else {
        pruneAppBlocks(val);
      }
    }
    if (removed.length && Array.isArray(node.block_order)) {
      node.block_order = node.block_order.filter((k) => !removed.includes(k));
    }
  }
  // Also remove top-level app-typed sections from a `sections` object
  if (node.sections && typeof node.sections === 'object' && !Array.isArray(node.sections)) {
    const removed = [];
    for (const [key, val] of Object.entries(node.sections)) {
      if (val && typeof val === 'object' && isAppType(val.type)) {
        removed.push(key);
        delete node.sections[key];
      } else {
        pruneAppBlocks(val);
      }
    }
    if (removed.length && Array.isArray(node.order)) {
      node.order = node.order.filter((k) => !removed.includes(k));
    }
  }
  // Recurse into other object children
  for (const [k, v] of Object.entries(node)) {
    if (k === 'blocks' || k === 'sections') continue;
    if (v && typeof v === 'object') pruneAppBlocks(v);
  }
}

// Walk every string value in the JSON and rewrite image refs.
// If rewriteImageRefValue returns the DELETE sentinel, drop the parent key entirely
// (so e.g. "video" settings that can't be empty just disappear and Shopify uses the default).
function rewriteImageRefsInJson(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') {
        const rv = rewriteImageRefValue(node[i]);
        node[i] = rv === DELETE ? '' : rv;
      } else if (node[i] && typeof node[i] === 'object') rewriteImageRefsInJson(node[i]);
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const rv = rewriteImageRefValue(v);
      if (rv === DELETE) delete node[k];
      else node[k] = rv;
    } else if (v && typeof v === 'object') rewriteImageRefsInJson(v);
  }
}

// Shopify-generated JSON files use JSON5 conventions: leading /* ... */ comments,
// and trailing commas before } or ]. Normalise both before parsing.
function stripJsonComments(text) {
  return text
    .replace(/^\s*\/\*[\s\S]*?\*\//, '')
    .replace(/,(\s*[}\]])/g, '$1');
}

function rewriteRefs(text) {
  const stripped = stripJsonComments(text);
  let data;
  try { data = JSON.parse(stripped); }
  catch { return text; }  // Not a JSON file we can parse — return original
  pruneAppBlocks(data);
  rewriteImageRefsInJson(data);
  return JSON.stringify(data, null, 2);
}

async function uploadFile(f) {
  const buf = readFileSync(f.full);
  let value;
  if (f.isText) {
    value = buf.toString('utf-8');
    if (f.key.endsWith('.json')) value = rewriteRefs(value);
  }
  const asset = f.isText
    ? { key: f.key, value }
    : { key: f.key, attachment: buf.toString('base64') };
  await api('PUT', `themes/${themeId}/assets.json`, { asset });
}

let ok = 0;
const failedFiles = [];
let lastLog = Date.now();

for (const phase of [1, 2, 3, 99]) {
  const batch = files.filter((f) => f.phase === phase);
  if (!batch.length) continue;
  console.log(`  phase ${phase}: ${batch.length} files`);
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (idx < batch.length) {
        const f = batch[idx++];
        try { await uploadFile(f); ok++; } catch (e) { failedFiles.push({ f, err: e.message }); }
        if (Date.now() - lastLog > 2000) {
          console.log(`    ${ok + failedFiles.length}/${files.length} (${ok} ok, ${failedFiles.length} failed)`);
          lastLog = Date.now();
        }
      }
    }),
  );
}

// Retry pass — by now all dependencies are in place
if (failedFiles.length) {
  console.log(`  retrying ${failedFiles.length} failed files…`);
  const retry = [...failedFiles];
  failedFiles.length = 0;
  for (const item of retry) {
    try { await uploadFile(item.f); ok++; }
    catch (e) { failedFiles.push({ f: item.f, err: e.message }); }
  }
}

if (failedFiles.length) {
  console.log(`  ${failedFiles.length} files still failing after retry:`);
  for (const { f, err } of failedFiles.slice(0, 5)) {
    console.log(`    [fail] ${f.key}: ${err.slice(0, 120)}`);
  }
}
console.log(`  ${ok}/${files.length} uploaded (${failedFiles.length} hard failures)`);

// --- Publish ---
console.log('Publishing theme...');
await api('PUT', `themes/${themeId}.json`, { theme: { id: themeId, role: 'main' } });

const elapsed = Math.round((Date.now() - startedAt) / 1000);
console.log(`\n✓ Theme pushed and published in ${elapsed}s.`);
console.log(`Visit your store: ${BASE}`);
