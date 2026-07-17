// Generates public/features/index.json — the list of bundled .feature files
// used by the FilesPanel static fallback (GitHub Pages / npm run dev).
// Runs automatically via the npm "prebuild" / "prebuild-only" hooks.
import { readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(appDir, 'public', 'features');
const files = readdirSync(dir).filter(f => f.endsWith('.feature')).sort();
writeFileSync(join(dir, 'index.json'), JSON.stringify(files, null, 2) + '\n');
console.log(`features/index.json: ${files.length} files`);
