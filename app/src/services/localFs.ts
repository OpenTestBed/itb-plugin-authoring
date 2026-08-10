// Local folder access via the File System Access API.
//
// Lets the workbench read and write .feature files in a folder the user picks,
// with no server at all — so it works from GitHub Pages. Requires a secure
// context (HTTPS or localhost) and a Chromium browser; Firefox and Safari have
// no showDirectoryPicker, and callers fall back to download/upload.
//
// The chosen directory handle is kept in IndexedDB so the folder can be
// reopened on the next visit. Permission does not survive the session, so
// reopening re-prompts once (see restoreDirectory).

const DB_NAME = 'itb-workbench';
const STORE = 'handles';
const KEY = 'featuresDir';

/** Is the File System Access API usable in this browser and context? */
export function localFsSupported(): boolean {
  return typeof window !== 'undefined'
    && 'showDirectoryPicker' in window
    && window.isSecureContext;
}

// ── IndexedDB handle persistence ─────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch { return undefined; }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* handle persistence is best-effort */ }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Directory handling ───────────────────────────────────────────────

/** Prompt for a folder and remember it. Returns null if the user cancels. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!localFsSupported()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({
      id: 'itb-features',
      mode: 'readwrite',
      startIn: 'documents',
    }) as FileSystemDirectoryHandle;
    await idbSet(KEY, handle);
    return handle;
  } catch {
    return null; // user cancelled or permission denied
  }
}

/**
 * Reopen the remembered folder.
 *
 * `prompt: false` (the default) only succeeds when permission is still granted,
 * so it can run silently at startup. `prompt: true` asks the user to re-grant,
 * and must therefore be called from a user gesture.
 */
export async function restoreDirectory(prompt = false): Promise<FileSystemDirectoryHandle | null> {
  if (!localFsSupported()) return null;
  const handle = await idbGet<FileSystemDirectoryHandle>(KEY);
  if (!handle) return null;
  try {
    const opts = { mode: 'readwrite' } as const;
    let perm = await (handle as any).queryPermission(opts);
    if (perm !== 'granted' && prompt) perm = await (handle as any).requestPermission(opts);
    if (perm !== 'granted') return null;
    return handle;
  } catch {
    await idbDelete(KEY);
    return null;
  }
}

/** Is a folder remembered from a previous session? */
export async function hasRememberedDirectory(): Promise<boolean> {
  return !!(await idbGet<FileSystemDirectoryHandle>(KEY));
}

export async function forgetDirectory(): Promise<void> {
  await idbDelete(KEY);
}

// ── File operations ──────────────────────────────────────────────────

/** List the .feature files directly inside the folder, sorted. */
export async function listFeatures(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, entry] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (entry.kind === 'file' && name.endsWith('.feature')) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export async function readFeature(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  const fileHandle = await dir.getFileHandle(name);
  return (await fileHandle.getFile()).text();
}

export async function writeFeature(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(content);
  await writable.close();
}

export async function deleteFeature(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  await (dir as any).removeEntry(name);
}
