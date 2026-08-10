// One interface over the three places .feature files can live.
//
//   server  — the authoring-plugin container mounts itb-cli/features and serves
//             /api/features + /api/feature?name=X (read-write)
//   local   — a folder the user picked via the File System Access API; works
//             with no server at all, including from GitHub Pages (read-write)
//   bundled — the features committed to public/features/, listed by
//             features/index.json (read-only, always available)

import {
  listFeatures, readFeature, writeFeature, deleteFeature,
} from './localFs';

export type FileSourceKind = 'bundled' | 'local' | 'server';

export interface FileSource {
  kind: FileSourceKind;
  /** Shown in the status bar. */
  label: string;
  writable: boolean;
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, content: string): Promise<void>;
  remove(name: string): Promise<void>;
}

const base = () => import.meta.env.BASE_URL || '/';

const readOnly = (kind: string) => async () => {
  throw new Error(`${kind} files are read-only`);
};

/** Probe for the authoring-plugin server. Cheap enough to run at startup. */
export async function serverAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/api/features', { method: 'GET' });
    return r.ok;
  } catch {
    return false;
  }
}

export function bundledSource(): FileSource {
  return {
    kind: 'bundled',
    label: 'bundled · read-only',
    writable: false,
    async list() {
      const r = await fetch(`${base()}features/index.json`);
      if (!r.ok) throw new Error(`feature index unavailable (${r.status})`);
      return (await r.json()) as string[];
    },
    async read(name) {
      const r = await fetch(`${base()}features/${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error(`load failed (${r.status})`);
      return r.text();
    },
    write: readOnly('Bundled'),
    remove: readOnly('Bundled'),
  };
}

export function serverSource(): FileSource {
  return {
    kind: 'server',
    label: 'itb-cli/features · read-write',
    writable: true,
    async list() {
      const r = await fetch('/api/features');
      if (!r.ok) throw new Error(`list failed (${r.status})`);
      return (await r.json()) as string[];
    },
    async read(name) {
      const r = await fetch(`/api/feature?name=${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error(`load failed (${r.status})`);
      return r.text();
    },
    async write(name, content) {
      const r = await fetch(`/api/feature?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: content,
      });
      if (!r.ok) throw new Error(`save failed (${r.status})`);
    },
    async remove(name) {
      const r = await fetch(`/api/feature?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`delete failed (${r.status})`);
    },
  };
}

export function localSource(dir: FileSystemDirectoryHandle): FileSource {
  return {
    kind: 'local',
    label: `${dir.name}/ · local folder`,
    writable: true,
    list: () => listFeatures(dir),
    read: (name) => readFeature(dir, name),
    write: (name, content) => writeFeature(dir, name, content),
    remove: (name) => deleteFeature(dir, name),
  };
}

/** Normalise a user-typed name to a .feature filename. */
export function asFeatureName(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith('.feature') ? trimmed : `${trimmed}.feature`;
}
