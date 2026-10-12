#!/usr/bin/env node
// Mirror the canonical skills into the publishable plugin.
//
//   node scripts/sync-skills.mjs            copy .claude/skills -> plugins/otb-testing/skills
//   node scripts/sync-skills.mjs --check    report drift, exit 1 if any (for CI)
//
// WHY THERE ARE TWO COPIES, since this repository has complained about vendoring
// twice already. Two audiences need the same files in two places, and neither
// can be moved:
//
//   .claude/skills/              Claude Code reads this automatically for anyone
//                                working inside a clone. It is what makes the
//                                getting-started path "clone, npm install, talk"
//                                with no slash commands and no plugin install.
//   plugins/otb-testing/skills/  a plugin's skills must live inside the plugin
//                                directory, which is what makes
//                                `/plugin marketplace add OpenTestBed/...` work
//                                for someone who wants the skills in a project
//                                that is not this one.
//
// A symlink would avoid the copy, but `git config core.symlinks` is false on
// Windows checkouts, where a committed symlink arrives as a text file containing
// a path. So: one canonical source, one generated mirror, and a --check that
// fails rather than letting them drift apart quietly.
//
// DIRECTION OF TRUTH: .claude/skills/ ==canonical==> plugins/otb-testing/skills/
// Edit the canonical copy. The mirror is overwritten.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '.claude', 'skills');
const DST = path.join(ROOT, 'plugins', 'otb-testing', 'skills');
const CHECK = process.argv.includes('--check');

if (!fs.existsSync(SRC)) {
  console.error(`no canonical skills at ${SRC}`);
  process.exit(2);
}

/** Every file under dir, as paths relative to it. */
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const srcFiles = walk(SRC).sort();
const dstFiles = fs.existsSync(DST) ? walk(DST).sort() : [];

const same = (rel) => {
  try {
    return fs.readFileSync(path.join(SRC, rel)).equals(fs.readFileSync(path.join(DST, rel)));
  } catch { return false; }
};

const missing = srcFiles.filter(f => !dstFiles.includes(f));
const extra = dstFiles.filter(f => !srcFiles.includes(f));
const changed = srcFiles.filter(f => dstFiles.includes(f) && !same(f));

if (CHECK) {
  for (const f of missing) console.log(`MISSING  ${f}`);
  for (const f of extra) console.log(`EXTRA    ${f}`);
  for (const f of changed) console.log(`DIFFERS  ${f}`);
  const n = missing.length + extra.length + changed.length;
  if (n) {
    console.log(`\nplugin mirror is stale — ${n} difference(s). Run: node scripts/sync-skills.mjs`);
    process.exit(1);
  }
  console.log(`plugin mirror matches the canonical skills (${srcFiles.length} files)`);
  process.exit(0);
}

for (const f of extra) {
  fs.rmSync(path.join(DST, f));
  console.log(`  - ${f}`);
}
for (const f of srcFiles) {
  if (dstFiles.includes(f) && same(f)) continue;
  const target = path.join(DST, f);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(SRC, f), target);
  console.log(`  ${dstFiles.includes(f) ? '~' : '+'} ${f}`);
}
// Leave no empty directories behind after a removal.
const prune = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) prune(path.join(dir, e.name));
  }
  if (fs.readdirSync(dir).length === 0 && dir !== DST) fs.rmdirSync(dir);
};
prune(DST);

console.log(`\n${srcFiles.length} skill file(s) mirrored -> ${path.relative(ROOT, DST)}`);
