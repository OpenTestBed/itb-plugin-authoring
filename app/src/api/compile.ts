/**
 * Server-side Gherkin-to-TDL compilation.
 * Used by the /api/compile Vite middleware via SSR module loading.
 *
 * The language comes from @opentestbed/otb-gherkin (both generations);
 * components/ is read from public/ on disk, exactly as the CLI does it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { GherkinParser, XMLGenerator, setCatalogSource } from '@opentestbed/otb-gherkin';
import { createNodeSource } from '@opentestbed/otb-gherkin/node';
import { dataModels } from '../data/models';

const publicDir = join(process.cwd(), 'public');

function lang(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../lang/${file}`, import.meta.resolve('@opentestbed/otb-gherkin'))), 'utf8');
}

let sourceReady = false;
function ensureSource() {
  if (sourceReady) return;
  setCatalogSource(createNodeSource(publicDir, {
    assets: { 'lang/en.yml': lang('en.yml'), 'lang/en-1.yml': lang('en-1.yml') },
  }));
  sourceReady = true;
}

export async function compileGherkin(gherkinContent: string): Promise<{
  files: { filename: string; xml: string; type: string }[];
  testcaseName: string;
  error?: string;
  issues?: any[];
}> {
  try {
    ensureSource();
    const parser = new GherkinParser(dataModels[0], {
      services: { 'FHIR-validator': '1.2.0' },
      strictRequirements: false,
    });
    const parsed = parser.parse(gherkinContent);
    await parser.expandScenarioToIR(parsed);
    const gen = new XMLGenerator(parser);
    const out = gen.generate(parsed);
    // Parser issues (unknown steps, no SUT, …) and generator issues (missing
    // scriptlets, TDL the ITB validator would refuse) both block a deploy.
    const issues = [...(parsed.errors ?? []), ...(out.issues ?? [])];
    const errors = issues.filter((i: any) => i.severity === 'error');
    if (errors.length > 0) {
      return { files: [], testcaseName: '', error: `${errors.length} error(s) in Gherkin`, issues };
    }
    return {
      files: out.files,
      testcaseName: out.testcaseName,
      issues,
    };
  } catch (e: any) {
    return { files: [], testcaseName: '', error: String(e?.message ?? e) };
  }
}
