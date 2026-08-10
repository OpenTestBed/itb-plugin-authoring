// Open documents (editor tabs).
//
// A document is a .feature buffer with an origin. `saved` is the content as it
// last existed at that origin — the diff against `content` is what makes a tab
// dirty. Scratch documents (origin 'scratch') have no backing file and are
// always dirty until saved somewhere.

import { useCallback, useState } from 'react';

export type DocOrigin = 'bundled' | 'local' | 'server' | 'scratch';

export interface Doc {
  /** Filename, or a generated name for scratch buffers. Unique — it is the tab key. */
  name: string;
  content: string;
  /** Content as last read from / written to the origin. null for never-saved scratch. */
  saved: string | null;
  origin: DocOrigin;
}

export interface DocumentStore {
  docs: Record<string, Doc>;
  openTabs: string[];
  active: string | null;
  activeDoc: Doc | null;
  isDirty: (name: string) => boolean;
  dirtyCount: number;

  /** Open (or focus) a document. Existing buffers are not overwritten. */
  open: (name: string, content: string, origin: DocOrigin) => void;
  /** Open a document, replacing any existing buffer with the same name. */
  openFresh: (name: string, content: string, origin: DocOrigin) => void;
  newScratch: () => string;
  close: (name: string) => void;
  focus: (name: string) => void;
  setContent: (name: string, content: string) => void;
  /** Mark clean after a successful write, optionally renaming (save-as). */
  markSaved: (name: string, origin: DocOrigin, newName?: string) => void;
}

let scratchSeq = 0;

export function useDocuments(): DocumentStore {
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const focus = useCallback((name: string) => setActive(name), []);

  const openInternal = useCallback((name: string, content: string, origin: DocOrigin, replace: boolean) => {
    setDocs(prev => {
      if (prev[name] && !replace) return prev;
      return { ...prev, [name]: { name, content, saved: origin === 'scratch' ? null : content, origin } };
    });
    setOpenTabs(prev => (prev.includes(name) ? prev : [...prev, name]));
    setActive(name);
  }, []);

  const open = useCallback(
    (name: string, content: string, origin: DocOrigin) => openInternal(name, content, origin, false),
    [openInternal],
  );

  const openFresh = useCallback(
    (name: string, content: string, origin: DocOrigin) => openInternal(name, content, origin, true),
    [openInternal],
  );

  const newScratch = useCallback(() => {
    scratchSeq += 1;
    const name = `untitled-${scratchSeq}.feature`;
    openInternal(name, '', 'scratch', true);
    return name;
  }, [openInternal]);

  const close = useCallback((name: string) => {
    setOpenTabs(prev => {
      const idx = prev.indexOf(name);
      if (idx === -1) return prev;
      const next = prev.filter(n => n !== name);
      setActive(cur => (cur === name ? next[Math.min(idx, next.length - 1)] ?? null : cur));
      return next;
    });
    setDocs(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const setContent = useCallback((name: string, content: string) => {
    setDocs(prev => (prev[name] ? { ...prev, [name]: { ...prev[name], content } } : prev));
  }, []);

  const markSaved = useCallback((name: string, origin: DocOrigin, newName?: string) => {
    setDocs(prev => {
      const doc = prev[name];
      if (!doc) return prev;
      const target = newName ?? name;
      const next = { ...prev };
      if (newName && newName !== name) delete next[name];
      next[target] = { ...doc, name: target, saved: doc.content, origin };
      return next;
    });
    if (newName && newName !== name) {
      setOpenTabs(prev => prev.map(n => (n === name ? newName : n)));
      setActive(cur => (cur === name ? newName : cur));
    }
  }, []);

  const isDirty = useCallback(
    (name: string) => {
      const doc = docs[name];
      return !!doc && doc.content !== doc.saved;
    },
    [docs],
  );

  return {
    docs,
    openTabs,
    active,
    activeDoc: active ? docs[active] ?? null : null,
    isDirty,
    dirtyCount: openTabs.filter(n => docs[n] && docs[n].content !== docs[n].saved).length,
    open,
    openFresh,
    newScratch,
    close,
    focus,
    setContent,
    markSaved,
  };
}
