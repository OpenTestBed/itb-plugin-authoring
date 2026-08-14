// Loading raw-ITB scriptlets from wherever the author keeps them.
//
// A `call scriptlet "foo"` step resolves to the suite-relative path
// `scriptlets/foo.xml`. That file can live:
//
//   - beside the feature files, in `scriptlets/` (the convention)
//   - in any other folder or URL named in the feature's `# itb:` header
//   - inside an enabled component (handled by the generator, not here)
//
// Everything is keyed by the suite-relative path so the generator can index it
// directly, and so the ZIP layout matches the source layout.

import { FileSource } from './fileSources';

/** Turn a scriptlet id into the path used inside the generated test suite. */
export function scriptletPath(id: string): string {
  return `scriptlets/${id}.xml`;
}

const isUrl = (loc: string) => /^https?:\/\//i.test(loc);

/**
 * Does this actually look like a GITB scriptlet?
 *
 * Required, not paranoia: a dev server (and many static hosts) answer an
 * unknown path with index.html and a 200, so a plain `res.ok` check happily
 * accepts an HTML page as a scriptlet — the missing file then never reports,
 * and the HTML lands in the deployed suite.
 */
function looksLikeScriptlet(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) return false;
  return head.includes('<scriptlet');
}

/**
 * Fetch one scriptlet from one location. Returns null when it isn't there,
 * which is normal — locations are tried in order until one hits.
 */
async function loadOne(source: FileSource, location: string, id: string): Promise<string | null> {
  const file = `${id}.xml`;
  try {
    let text: string;
    if (isUrl(location)) {
      const res = await fetch(`${location}/${encodeURIComponent(file)}`);
      if (!res.ok) return null;
      text = await res.text();
    } else {
      // Relative to the root of the active file source, not to the individual
      // feature file — otherwise moving a feature between subfolders silently
      // breaks its scriptlets.
      const rel = location.replace(/^\.\//, '').replace(/\/+$/, '');
      text = await source.read(`${rel}/${file}`);
    }
    return looksLikeScriptlet(text) ? text : null;
  } catch {
    return null;
  }
}

/**
 * Resolve every requested scriptlet id against the given locations, in order.
 * Ids that resolve nowhere are simply absent from the result — the generator
 * reports them, since only it knows which step referenced them.
 */
export async function loadScriptlets(
  source: FileSource,
  locations: string[],
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    ids.map(async id => {
      for (const location of locations) {
        const xml = await loadOne(source, location, id);
        if (xml) { out.set(scriptletPath(id), xml); return; }
      }
    }),
  );
  return out;
}

/** Scriptlet ids referenced by `call scriptlet "<id>"` steps in a feature. */
export function referencedScriptletIds(source: string): string[] {
  const ids = new Set<string>();
  const re = /^\s*(?:Given|When|Then|And|But)\s+call scriptlet\s+"([^"]+)"/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) ids.add(m[1]);
  return [...ids];
}
