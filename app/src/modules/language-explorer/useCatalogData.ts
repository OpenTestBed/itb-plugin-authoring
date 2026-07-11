import { useState, useEffect } from 'react';
import { loadCatalog, loadAllComponents, mergeCatalog, CatalogStep, ComponentInfo } from '../../parser/languageCatalog';

export interface StepEntry {
  match: string;
  humanPattern: string;
  description: string;
  category: string;
  source: 'core' | string; // 'core' or component name
  actions: any[];
  hasTable: boolean;
  hasDocString: boolean;
  captureCount: number;
  requires?: any;
  /** Group key for related variants (e.g. all actor declarations) */
  groupKey?: string;
}

/** A documented step — may represent multiple regex variants */
export interface DocStep {
  /** Display pattern with [optional] parts */
  docPattern: string;
  /** All variant step entries */
  variants: StepEntry[];
  category: string;
  source: string;
}

/** Groups of related step patterns that should be documented as one */
/** Groups of related step patterns that should be documented as one */
const DOC_GROUPS: Record<string, { docPattern: string; matchers: RegExp[] }> = {
  'actor-sut': {
    docPattern: '<Actor> is the system under test [at <endpoint>] [as defined by <canonical>]',
    matchers: [/is the system under test/],
  },
  'actor-available': {
    docPattern: '<Actor> is available [as "<name>"] [at <endpoint>] [as defined by <canonical>]',
    matchers: [/is available/],
  },
  'interaction-inform': {
    docPattern: '<Actor> is informed "<message>" [with "<content>"]',
    matchers: [/is informed "/],
  },
  'interaction-ask': {
    docPattern: '<Actor> is asked for "<variable>" [with "<message>"]',
    matchers: [/is asked for "/],
  },
  'validate-resource': {
    docPattern: 'validate "<resource>" against "<profiles>" [with best practice "<level>"] [with resource id "<rule>"]',
    matchers: [/^validate ".*" against "/],
  },
  'validation-result': {
    docPattern: 'the validation should pass|fail',
    matchers: [/^the validation should (pass|fail)/],
  },
  'fhirpath-evaluate': {
    docPattern: 'evaluate FHIRPath "<expression>" [on "<resource>"] [and expect "<value>" | as "<variable>" | exists | count is <n>]',
    matchers: [/evaluate FHIRPath/],
  },
  'wait-receive': {
    docPattern: '<Actor> waits for <Actor> [within <number> seconds]',
    matchers: [/waits for/],
  },
  'conditional': {
    docPattern: 'if "<variable>" is [not empty | "<value>"] then "<variable>" should [be|contain] "<value>"',
    matchers: [/^if "/],
  },
  'assertion': {
    docPattern: '"<variable>" should [not] be "<value>" | should [not] contain "<value>" | should not be empty',
    matchers: [/^"[^"]+" should/, /should not be empty/],
  },
  'http-methods': {
    docPattern: '<Actor> posts|puts to <Actor> at "<path>" with: | <Actor> deletes on <Actor> at "<path>" | <Actor> gets "<url>" as "<variable>"',
    matchers: [/posts to/, /puts to/, /deletes on/, /gets "/],
  },
  'set-variable': {
    docPattern: 'set "<variable>" to "<value>" | to: (docstring)',
    matchers: [/^set "/],
  },
  'extract': {
    docPattern: 'extract "<pointer>" [from "<variable>"] as "<variable>"',
    matchers: [/^extract "/],
  },
  'matchetype': {
    docPattern: '[partially|exactly] match "<resource>" against: (docstring) | "<resource>" should NOT match: (docstring)',
    matchers: [/match ".*" against/, /should NOT match/],
  },
  'package-loading': {
    docPattern: '<Actor> is loaded with package "<package>"',
    matchers: [/is loaded with package/],
  },
  'ask-input': {
    docPattern: 'ask <user|monitor> for "<variable>" [with prompt "<description>"]',
    matchers: [/^ask (user|monitor) for "/],
  },
};

/** Infer a category from the step pattern and actions */
function inferCategory(step: CatalogStep): string {
  const m = step.match;
  const actions = step.actions || [];
  const actionTypes = actions.map((a: any) => Object.keys(a)[0]);

  // 1. Actors
  if (actionTypes.includes('declareActor')) return 'Actors';
  if (m.includes('loaded with package')) return 'Actors';

  // 2. HTTP
  if (m.includes('posts to') || m.includes('puts to') || m.includes('deletes on') || m.includes('gets "') || m.includes('set header')) return 'HTTP Requests';

  // 3. Variables & Data
  if (m.includes('set "') || m.includes('define resource') || m.includes('define ')) return 'Variables & Data';
  if (m.includes('extract') && !m.includes('FHIRPath')) return 'Variables & Data';
  if (actionTypes.includes('interact') || m.includes('ask ')) return 'Variables & Data';

  // 4. Wait / Receive
  if (m.includes('waits for')) return 'Wait / Receive';

  // 5. Conditionals
  if (m.startsWith('^if "')) return 'Conditionals';

  // 5. Assertions
  if (m.includes('should be') || m.includes('should contain') || m.includes('should not be')) return 'Assertions';

  // 5. Interaction
  if (m.includes('inform') || m.includes('monitor')) return 'Interaction';

  // 6. Logging
  if (m.includes('log')) return 'Logging';

  // Component-provided categories
  if (m.includes('FHIRPath') || m.includes('fhirpath')) return 'FHIRPath & Extraction';
  if (m.includes('validat')) return 'Validation';
  if (m.includes('match')) return 'Matchetype';
  if (m.includes('generate') || m.includes('test data') || m.includes('mappings') || m.includes('define data')) return 'Test Data';
  if (m.includes('resource type')) return 'Assertions';
  if (m.includes('extract')) return 'FHIRPath & Extraction';

  return 'General';
}

/** Convert a regex pattern to a human-readable step template */
function toHumanPattern(match: string): string {
  let paramIdx = 0;
  return match
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\(\?:[^)]+\)/g, (m) => m.replace('(?:', '').replace(')', '')) // flatten non-capture groups
    .replace(/\([^)]*\)/g, (m) => {
      paramIdx++;
      // First capture in a step is usually the actor (starts with uppercase letter pattern)
      if (m === '([A-Za-z][A-Za-z0-9_]*)' && paramIdx <= 2) return '<Actor>';
      if (m.includes('A-Za-z_') || m.includes('A-Za-z0-9_')) return '<variable>';
      if (m.includes('https?')) return '<url>';
      if (m.includes('[0-9]')) return '<number>';
      if (m.includes('[^"]+')) return '<value>';
      return '<param>';
    })
    .replace(/\\s\+/g, ' ')
    .replace(/\\[()]/g, (m) => m[1])
    .replace(/\\"/, '"');
}

/** Count regex capture groups */
function countCaptures(match: string): number {
  const re = /\((?!\?)/g;
  let count = 0;
  while (re.exec(match)) count++;
  return count;
}

/** Check if step uses docstring */
function usesDocString(step: CatalogStep): boolean {
  return JSON.stringify(step.actions).includes('$docString');
}

/** Check if step uses table */
function usesTable(step: CatalogStep): boolean {
  return !!step.table;
}

export function useCatalogData() {
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const [docSteps, setDocSteps] = useState<DocStep[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<ComponentInfo[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const core = await loadCatalog('en');
        const comps = await loadAllComponents();
        setComponents(comps);
        const merged = mergeCatalog(core, comps);

        const entries: StepEntry[] = merged.steps.map(step => {
          const source = step._source
            ? step._source.componentName
            : 'core';
          return {
            match: step.match,
            humanPattern: toHumanPattern(step.match),
            description: '', // Could be derived or added to YAML later
            category: inferCategory(step),
            source,
            actions: step.actions,
            hasTable: usesTable(step),
            hasDocString: usesDocString(step),
            captureCount: countCaptures(step.match),
            requires: step.requires,
          };
        });

        // Sort categories: core first, then by name
        const cats = [...new Set(entries.map(e => e.category))];
        const coreOrder = [
          'Actors', 'HTTP Requests', 'Variables & Data', 'Wait / Receive', 'Conditionals', 'Assertions', 'Interaction', 'Logging',
          'Validation', 'FHIRPath & Extraction', 'Matchetype', 'Test Data', 'General',
        ];
        cats.sort((a, b) => {
          const ai = coreOrder.indexOf(a);
          const bi = coreOrder.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        // Build doc steps — group related variants
        const grouped = new Map<string, StepEntry[]>();
        const ungrouped: StepEntry[] = [];
        for (const entry of entries) {
          let matched = false;
          for (const [groupKey, group] of Object.entries(DOC_GROUPS)) {
            if (group.matchers.some(re => re.test(entry.match))) {
              entry.groupKey = groupKey;
              const list = grouped.get(groupKey) || [];
              list.push(entry);
              grouped.set(groupKey, list);
              matched = true;
              break;
            }
          }
          if (!matched) ungrouped.push(entry);
        }

        const docs: DocStep[] = [];
        for (const [groupKey, variants] of grouped) {
          const group = DOC_GROUPS[groupKey];
          docs.push({
            docPattern: group.docPattern,
            variants,
            category: variants[0].category,
            source: variants[0].source,
          });
        }
        for (const entry of ungrouped) {
          docs.push({
            docPattern: entry.humanPattern,
            variants: [entry],
            category: entry.category,
            source: entry.source,
          });
        }

        setSteps(entries);
        setDocSteps(docs);
        setCategories(cats);
      } catch (e) {
        console.error('Failed to load catalog:', e);
      }
      setLoading(false);
    })();
  }, []);

  return { steps, docSteps, categories, loading, components };
}
