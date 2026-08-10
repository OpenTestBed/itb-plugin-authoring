export interface SampleResource {
  resourceType: string;
  profile: string;
  data: Record<string, string>;
}

export interface SamplePool {
  id: string;
  label: string;
  description: string;
  resources: SampleResource[];
}

export interface SamplePoolsConfig {
  pools: SamplePool[];
}

let cached: SamplePoolsConfig | null = null;

export async function loadSamplePools(): Promise<SamplePoolsConfig> {
  if (cached) return cached;
  // Must go through BASE_URL: the app is served under /itb-plugin-authoring/
  // on Pages and /test-workbench/ in dev, so an absolute /data/... 404s in
  // both. Matches how models.ts and languageCatalog.ts load their assets.
  const base = import.meta.env.BASE_URL || '/';
  const res = await fetch(`${base}data/sample-pools.json`);
  if (!res.ok) throw new Error(`sample pools unavailable (${res.status})`);
  cached = await res.json();
  return cached!;
}

export function getSamplePoolIds(config: SamplePoolsConfig): string[] {
  return config.pools.map(p => p.id);
}
