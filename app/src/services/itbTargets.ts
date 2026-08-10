// Saved ITB targets.
//
// The workbench keeps ONE active ITBConfig (see itbClient.loadITBConfig) —
// everything that deploys or runs reads that. This adds a named list on top so
// you can keep a local docker test bed, an acceptance instance and a staging
// one side by side and switch between them from the status bar.
//
// A target stores a full ITBConfig snapshot, keys included, so switching is a
// single assignment rather than a partial merge.

import { ITBConfig } from './itbClient';

export interface ITBTarget {
  id: string;
  label: string;
  config: ITBConfig;
}

const KEY = 'itb-targets';
const ACTIVE_KEY = 'itb-active-target';

export function loadTargets(): ITBTarget[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTargets(targets: ITBTarget[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(targets)); } catch { /* quota */ }
}

export function activeTargetId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveTargetId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* quota */ }
}

function newId(): string {
  return `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Add a target from the current config, or update the one with this label. */
export function upsertTarget(label: string, config: ITBConfig): ITBTarget[] {
  const targets = loadTargets();
  const existing = targets.find(t => t.label === label);
  if (existing) {
    existing.config = config;
    saveTargets(targets);
    setActiveTargetId(existing.id);
    return targets;
  }
  const target: ITBTarget = { id: newId(), label, config };
  const next = [...targets, target];
  saveTargets(next);
  setActiveTargetId(target.id);
  return next;
}

export function removeTarget(id: string): ITBTarget[] {
  const next = loadTargets().filter(t => t.id !== id);
  saveTargets(next);
  if (activeTargetId() === id) setActiveTargetId(null);
  return next;
}

/** Short host label for the status bar, e.g. "localhost:9000". */
export function hostLabel(config: ITBConfig): string {
  const url = (config.baseUrl || '').trim();
  if (!url) return 'not set';
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}
