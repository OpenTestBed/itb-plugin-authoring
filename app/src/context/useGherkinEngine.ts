import { useState, useEffect, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { XMLOutput } from '../parser/xmlGenerator';
import { ParsedScenario } from '../types';
import { RequiredActor } from '../components/ComponentsPanel';
import { StepHighlight } from '../components/Editor';
import { validateTDL } from '../validation/gitbValidator';

export interface GherkinEngine {
  parsedScenario: ParsedScenario | null;
  xmlOutput: XMLOutput | null;
  issues: any[];
  requiredActors: RequiredActor[];
  /** Id of the first actor declared with role SUT, if any. */
  sutActor: string | null;
  stepHighlights: StepHighlight[];
  /** Feature-wide Gherkin tags, lowercased and without the leading `@`. */
  featureTags: string[];
  errorCount: number;
  warnCount: number;
  scenarioCount: number;
}

/**
 * Parse → expand → generate → validate, for one buffer.
 *
 * The buffer itself is owned by the document store (see useDocuments), so the
 * engine is a pure derivation of whatever text is passed in. Switching tabs
 * just re-runs it against the new content.
 */
export function useGherkinEngine(gherkinContent: string): GherkinEngine {
  const { parser, generator } = useAppContext();
  const [parsedScenario, setParsedScenario] = useState<ParsedScenario | null>(null);
  const [issues, setIssues] = useState<any[]>([]);

  // Parse + expand on content change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!gherkinContent.trim()) {
          setParsedScenario(null);
          setIssues([]);
          return;
        }
        const parsed = parser.parse(gherkinContent);
        await parser.expandScenarioToIR(parsed);
        if (!cancelled) {
          setParsedScenario(parsed);
          setIssues(parsed.errors ?? []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setParsedScenario(null);
          setIssues([{ severity: 'error', message: String(e?.message ?? e), line: 1 }]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [gherkinContent, parser]);

  // Generate XML
  const xmlOutput: XMLOutput | null = useMemo(() => {
    if (!parsedScenario) return null;
    return generator.generate(parsedScenario);
  }, [parsedScenario, generator]);

  // Schema validation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!xmlOutput || !parsedScenario) return;
      const allSchemaIssues = [];
      for (const file of xmlOutput.files) {
        const fileIssues = await validateTDL(file.xml);
        allSchemaIssues.push(...fileIssues.map(i => ({ ...i, message: `[${file.filename}] ${i.message}` })));
      }
      if (!cancelled) setIssues([...(parsedScenario.errors ?? []), ...allSchemaIssues]);
    })();
    return () => { cancelled = true; };
  }, [xmlOutput, parsedScenario]);

  // Required actors from IR
  const requiredActors: RequiredActor[] = useMemo(() => {
    if (!parsedScenario) return [];
    const scenarioIRs = (parsedScenario as any).__scenarioIRs as { name: string; ir: any[] }[] | undefined;
    if (!scenarioIRs) return [];
    const seen = new Set<string>();
    const actors: RequiredActor[] = [];
    for (const sc of scenarioIRs) {
      for (const action of sc.ir) {
        if (action.type === 'declareActor' && action.role !== 'SUT' && !seen.has(action.id)) {
          seen.add(action.id);
          actors.push({ id: action.id, endpoint: action.endpoint || undefined });
        }
      }
    }
    return actors;
  }, [parsedScenario]);

  // Plugin-dialect step highlights: classify each step line against the
  // catalog; only plugin-provided steps are returned (core = token colors).
  const stepHighlights: StepHighlight[] = useMemo(() => {
    const out: StepHighlight[] = [];
    const p = parser as any;
    if (!gherkinContent || typeof p.classifyStepText !== 'function') return out;
    const lines = gherkinContent.split(/\r?\n/);
    lines.forEach((lineText, i) => {
      const m = /^(\s*)(Given|When|Then|And|But)(\s+)(.+)$/.exec(lineText);
      if (!m) return;
      let src: { componentId: string; componentName: string } | null = null;
      try { src = p.classifyStepText(m[4]); } catch { /* catalog not ready */ }
      if (!src) return;
      out.push({
        line: i + 1,
        startColumn: m[1].length + m[2].length + m[3].length + 1,
        endColumn: lineText.length + 1,
        componentId: src.componentId,
        componentName: src.componentName,
      });
    });
    return out;
  }, [gherkinContent, parsedScenario, parser]);

  // The system under test — used to address the actor in steps inserted from
  // the side panels, so they land as `FHIRServer is …` rather than a stub.
  const sutActor: string | null = useMemo(() => {
    const scenarioIRs = (parsedScenario as any)?.__scenarioIRs as { ir: any[] }[] | undefined;
    if (!scenarioIRs) return null;
    for (const sc of scenarioIRs) {
      for (const action of sc.ir) {
        if (action.type === 'declareActor' && action.role === 'SUT') return action.id;
      }
    }
    return null;
  }, [parsedScenario]);

  const featureTags: string[] = useMemo(
    () => ((parsedScenario as any)?.__featureTags as string[] | undefined) ?? [],
    [parsedScenario],
  );

  const errorCount = issues.filter(e => e.severity === 'error').length;
  const warnCount = issues.filter(e => e.severity === 'warning').length;
  const scenarioCount = (parsedScenario as any)?.__scenarios?.length ?? 0;

  return {
    parsedScenario, xmlOutput, issues, requiredActors, sutActor, stepHighlights, featureTags,
    errorCount, warnCount, scenarioCount,
  };
}
