#!/usr/bin/env node
/*
 * Rewrite local theme JSON shopify://shop_images/*.png refs to .webp (per media-manifest.json).
 * Same rules as push-theme.mjs — run once so `shopify theme dev` and `shopify theme push`
 * match files uploaded to the dev store.
 *
 * Usage:
 *   node scripts/rewrite-local-theme-refs.mjs           # dry-run
 *   node scripts/rewrite-local-theme-refs.mjs --write   # apply
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const ROOT = process.cwd();
const manifestPath = path.join(ROOT, 'media-manifest.json');

if (!existsSync(manifestPath)) {
  console.error('Missing media-manifest.json');
  process.exit(1);
}

const mf = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const refMap = new Map();
for (const e of mf.files ?? []) refMap.set(e.origRef, e.newRef);

const DELETE = Symbol('delete-setting');
const THEME_DIRS = ['templates', 'sections', 'config', 'blocks'];

function rewriteImageRefValue(v) {
  if (typeof v !== 'string') return v;
  const m = v.match(/^shopify:\/\/(shop_images|shop_files)\/(.+)$/);
  if (m) {
    const orig = `shopify://${m[1]}/${m[2]}`;
    return refMap.get(orig) ?? DELETE;
  }
  if (v.startsWith('shopify://files/')) return DELETE;
  return v;
}

function isAppType(t) {
  return typeof t === 'string' && t.startsWith('shopify://apps/');
}

function pruneAppBlocks(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) pruneAppBlocks(item);
    return;
  }
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
  for (const [k, v] of Object.entries(node)) {
    if (k === 'blocks' || k === 'sections') continue;
    if (v && typeof v === 'object') pruneAppBlocks(v);
  }
}

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

function stripJsonComments(text) {
  return text.replace(/^\s*\/\*[\s\S]*?\*\//, '').replace(/,(\s*[}\]])/g, '$1');
}

function extractLeadingComment(text) {
  const m = text.match(/^(\s*\/\*[\s\S]*?\*\/\s*)/);
  return m ? { comment: m[1], body: text.slice(m[0].length) } : { comment: '', body: text };
}

function rewriteJsonFile(text) {
  const { comment, body } = extractLeadingComment(text);
  const stripped = stripJsonComments(body);
  let data;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  pruneAppBlocks(data);
  rewriteImageRefsInJson(data);
  const out = JSON.stringify(data, null, 2);
  return comment ? `${comment}${out}\n` : `${out}\n`;
}

function walkJsonFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkJsonFiles(full, out);
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

let changed = 0;
let skipped = 0;
const changes = [];

for (const dir of THEME_DIRS) {
  for (const file of walkJsonFiles(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    const before = readFileSync(file, 'utf-8');
    const after = rewriteJsonFile(before);
    if (after === null) {
      skipped++;
      continue;
    }
    if (after === before) continue;
    const pngBefore = (before.match(/shopify:\/\/shop_images\/[^"']+\.png/g) || []).length;
    const pngAfter = (after.match(/shopify:\/\/shop_images\/[^"']+\.png/g) || []).length;
    changes.push({ rel, pngBefore, pngAfter });
    if (WRITE) writeFileSync(file, after, 'utf-8');
    changed++;
  }
}

console.log(`Loaded ${refMap.size} ref rewrites from media-manifest.json`);
if (!WRITE) {
  console.log(`DRY RUN — ${changed} file(s) would change (${skipped} skipped)`);
  for (const { rel, pngBefore, pngAfter } of changes.slice(0, 25)) {
    console.log(`  ${rel} (shop_images .png: ${pngBefore} → ${pngAfter})`);
  }
  if (changes.length > 20) console.log(`  ... and ${changes.length - 20} more`);
  console.log('\nRun: node scripts/rewrite-local-theme-refs.mjs --write');
} else {
  console.log(`Updated ${changed} JSON file(s) (${skipped} skipped).`);
  console.log('Theme refs now use .webp filenames — matches media/ uploads and shopify theme dev.');
  console.log('Upload files once: node scripts/seed-to-dev-store.mjs --write (media step only if you add a flag — or full setup once).');
}
