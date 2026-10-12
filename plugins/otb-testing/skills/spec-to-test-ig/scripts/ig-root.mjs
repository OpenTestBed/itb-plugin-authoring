#!/usr/bin/env node
// Where do this user's implementation guides live?
//
//   node ig-root.mjs status           what we know, plus candidates found on disk
//   node ig-root.mjs set <path>       record it (created if missing)
//   node ig-root.mjs set none         stop asking; there is no default folder
//   node ig-root.mjs defer            "not now" — do not record, ask again next run
//   node ig-root.mjs out <ig-name>    print the absolute out path for an IG
//
// WHY THIS EXISTS. The IG builder needs somewhere to write, and guessing is
// worse than asking: an IG written into the wrong place is easy to miss and
// annoying to move once a git repository has been initialised in it. So the
// skill asks ONCE, records the answer, and never asks again — unless the answer
// was "not now", which is deliberately not recorded.
//
// Three terminal states, and "unset" is not one of them:
//   a path      use it
//   "none"      the user has no default; the skill asks per run instead
//   deferred    ask again next time (nothing is written to the config)
//
// The config is per user, not per project, because where someone keeps their
// IGs is a property of their machine rather than of one specification.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG = path.join(os.homedir(), '.claude', 'otb-testing.json');

const read = () => {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
};
const write = (cfg) => {
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
};

/** Does this directory hold an IG? The two files every published IG project has. */
const isIg = (dir) => {
  for (const f of ['sushi-config.yaml', 'ig.ini']) {
    try { if (fs.statSync(path.join(dir, f)).isFile()) return true; } catch { /* next */ }
  }
  return false;
};

/** How many of this directory's children are IGs? That is what makes it a root. */
function igCount(dir) {
  let n = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (isIg(path.join(dir, e.name))) n++;
  }
  return n;
}

/**
 * Look for a folder that already holds several IGs. Deliberately bounded: the
 * ancestors of the working directory and their immediate children, plus the
 * home directory. Scanning a whole disk to answer a question we could just ask
 * would be slower AND more likely to pick the wrong answer.
 */
function candidates() {
  const roots = new Set();
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    roots.add(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  roots.add(os.homedir());

  const found = [];
  for (const r of roots) {
    let entries;
    try { entries = fs.readdirSync(r, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(r, e.name);
      const n = igCount(p);
      if (n >= 2) found.push({ path: p, igs: n });
    }
  }
  // A folder holding more IGs is the better guess, but it stays a guess.
  return found.sort((a, b) => b.igs - a.igs).slice(0, 5);
}

const [cmd, ...rest] = process.argv.slice(2);
const cfg = read();

if (cmd === 'set') {
  const value = rest.join(' ').trim();
  if (!value) { console.error('set needs a path, or "none"'); process.exit(2); }

  if (value.toLowerCase() === 'none') {
    cfg.igRoot = null;
    cfg.igRootAnswered = 'none';
    delete cfg.igRootDeferred;
    write(cfg);
    console.log('recorded: no default IG folder. The skill will ask where to write each time,');
    console.log('and will not ask you to set a default again.');
    console.log(`config: ${CONFIG}`);
    process.exit(0);
  }

  const abs = path.resolve(value);
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(abs, { recursive: true });
    console.log(`created ${abs}`);
  } else if (!fs.statSync(abs).isDirectory()) {
    console.error(`${abs} exists and is not a directory`);
    process.exit(2);
  }
  cfg.igRoot = abs;
  cfg.igRootAnswered = 'path';
  delete cfg.igRootDeferred;
  write(cfg);
  console.log(`recorded IG root: ${abs}`);
  console.log(`  ${igCount(abs)} IG(s) already there`);
  console.log(`config: ${CONFIG}`);
  process.exit(0);
}

if (cmd === 'defer') {
  // Deliberately NOT persisted as an answer: "not now" means ask me again.
  cfg.igRootDeferred = new Date().toISOString().slice(0, 10);
  write(cfg);
  console.log('noted "not now" — nothing recorded, you will be asked again next time.');
  process.exit(0);
}

if (cmd === 'out') {
  const name = rest.join(' ').trim();
  if (!name) { console.error('out needs the IG folder name, e.g. ihe-iua-test'); process.exit(2); }
  if (!cfg.igRoot) {
    console.error(cfg.igRootAnswered === 'none'
      ? 'no default IG folder (you chose "none") — ask the user where this IG should go'
      : 'no IG root recorded yet — run `ig-root.mjs status` and ask the user first');
    process.exit(1);
  }
  console.log(path.join(cfg.igRoot, name));
  process.exit(0);
}

// ── status (default) ────────────────────────────────────────────────
if (cfg.igRoot) {
  console.log(`state:   set`);
  console.log(`igRoot:  ${cfg.igRoot}`);
  console.log(`         ${igCount(cfg.igRoot)} IG(s) there${fs.existsSync(cfg.igRoot) ? '' : '  — WARNING: does not exist any more'}`);
  console.log(`config:  ${CONFIG}`);
  console.log('\nDo not ask. Write the IG under this folder.');
  process.exit(0);
}

if (cfg.igRootAnswered === 'none') {
  console.log('state:   none');
  console.log(`config:  ${CONFIG}`);
  console.log('\nThe user has said they have no default IG folder. Do NOT ask again.');
  console.log('Ask where this one IG should go, or default to ./<ig-name> beside the features.');
  process.exit(0);
}

console.log('state:   unset' + (cfg.igRootDeferred ? `  (deferred on ${cfg.igRootDeferred})` : ''));
console.log(`config:  ${CONFIG}`);
const found = candidates();
if (found.length) {
  console.log('\ncandidates found on disk (a guess, not an answer):');
  for (const c of found) console.log(`  ${c.igs} IG(s)   ${c.path}`);
} else {
  console.log('\nno candidate folder found near the working directory.');
}
console.log('\nASK THE USER once, offering the best candidate. Then record the answer:');
console.log('  node ig-root.mjs set <path>     a folder (created if missing)');
console.log('  node ig-root.mjs set none       they have no default; never ask again');
console.log('  node ig-root.mjs defer          they said "not now"; ask again next time');
