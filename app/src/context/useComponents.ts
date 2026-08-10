// Component manifests + health, shared by the status bar, the Environment
// section and the environment-derived Problems rows.
//
// NOTE: ComponentsPanel still loads its own copy for its cards. Folding that
// panel onto this hook is the obvious next cleanup.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadAllComponents, checkComponentHealth, ComponentInfo, ComponentManifest,
} from '../parser/languageCatalog';
import { RequiredActor } from '../components/ComponentsPanel';

function endpointFor(manifest: ComponentManifest): string {
  const stored = localStorage.getItem(`component:${manifest.id}:endpoint`);
  if (stored) return stored;
  const port = manifest.docker?.ports?.[0]?.split(':')[0] || '8080';
  return `http://localhost:${port}`;
}

export interface ComponentsState {
  components: ComponentInfo[];
  healthy: number;
  unhealthy: number;
  enabled: number;
  checkAll: () => void;
}

export function useComponents(dialectsVersion: number, enabled: boolean): ComponentsState {
  const [components, setComponents] = useState<ComponentInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const comps = await loadAllComponents();
      if (cancelled) return;
      setComponents(comps);
    })();
    return () => { cancelled = true; };
  }, [dialectsVersion]);

  // Read through a ref so checkAll stays stable and never fires network calls
  // from inside a state updater (React may run those twice).
  const latest = useRef<ComponentInfo[]>([]);
  latest.current = components;

  const checkAll = useCallback(() => {
    for (const comp of latest.current) {
      if (!comp.enabled || !comp.manifest.healthCheck) continue;
      void checkComponentHealth(comp.manifest, endpointFor(comp.manifest)).then(status => {
        setComponents(cur => cur.map(c => (c.manifest.id === comp.manifest.id ? { ...c, status } : c)));
      });
    }
  }, []);

  // Only ping when there is a runtime worth pinging.
  useEffect(() => {
    if (!enabled || components.length === 0) return;
    checkAll();
  }, [enabled, components.length, checkAll]);

  return {
    components,
    healthy: components.filter(c => c.status === 'healthy').length,
    unhealthy: components.filter(c => c.enabled && c.status === 'unhealthy').length,
    enabled: components.filter(c => c.enabled).length,
    checkAll,
  };
}

export interface EnvProblem {
  severity: 'warning';
  line?: number;
  message: string;
  from: 'environment';
}

/**
 * Turn "this test case needs actor X" into diagnostics: X has no component at
 * all, its component is switched off, or the component is unreachable.
 */
export function environmentProblems(
  requiredActors: RequiredActor[],
  components: ComponentInfo[],
  active: boolean,
): EnvProblem[] {
  if (!active) return [];
  return requiredActors.flatMap<EnvProblem>(actor => {
    const provider = components.find(c => c.manifest.actors?.some(a => a.id === actor.id));
    if (!provider) {
      return [{
        severity: 'warning',
        from: 'environment',
        message: `Actor "${actor.id}" is required but no component provides it`,
      }];
    }
    if (!provider.enabled) {
      return [{
        severity: 'warning',
        from: 'environment',
        message: `Actor "${actor.id}" is required but ${provider.manifest.name} is disabled`,
      }];
    }
    if (provider.status === 'unhealthy') {
      return [{
        severity: 'warning',
        from: 'environment',
        message: `Actor "${actor.id}" is required but ${provider.manifest.name} is unreachable`,
      }];
    }
    return [];
  });
}
