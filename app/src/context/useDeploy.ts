// Deploy + run, lifted out of the old Deploy & Export page so the bottom
// drawer can stay presentational. Behaviour is unchanged: deploy the compiled
// suite, resolve the numeric IDs used by the "Open in ITB" link, make sure a
// system + conformance statement exist, then optionally start the tests.

import { useCallback, useState } from 'react';
import { useAppContext } from './AppContext';
import {
  deployToITB, ITBDeployResult, getITBAppUrl, resolveITBIds,
  getSpecificationActors, ensureSystem, ensureConformance, startTest, ITBTestResult,
} from '../services/itbClient';
import { XMLOutput } from '../parser/xmlGenerator';

export interface DeployState {
  deploying: boolean;
  running: boolean;
  result: ITBDeployResult | null;
  testResults: ITBTestResult[] | null;
  appUrl: string;
  deploy: (xmlOutput: XMLOutput) => Promise<void>;
  runTests: (xmlOutput: XMLOutput) => Promise<void>;
  reset: () => void;
}

export function useDeploy(): DeployState {
  const { itbConfig, setITBConfig, saveConfig } = useAppContext();
  const [deploying, setDeploying] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ITBDeployResult | null>(null);
  const [testResults, setTestResults] = useState<ITBTestResult[] | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Record<string, number | undefined>>({});

  const reset = useCallback(() => {
    setResult(null);
    setTestResults(null);
  }, []);

  const deploy = useCallback(async (xmlOutput: XMLOutput) => {
    setDeploying(true);
    setResult(null);
    setTestResults(null);

    const res = await deployToITB(xmlOutput.files, itbConfig);
    if (res.success && res.details?.completed === false) {
      res.success = false;
      res.message = 'ITB rejected the test suite.';
    }

    if (res.success && res.details) {
      try {
        const suiteFile = xmlOutput.files.find(f => f.type === 'testsuite');
        const tcFile = xmlOutput.files.find(f => f.type === 'testcase');
        const sutMatch = suiteFile?.xml.match(/actor id="([^"]+)"[^>]*role="SUT"/)
          || tcFile?.xml.match(/actor id="([^"]+)"[^>]*role="SUT"/);
        const sutActorId = sutMatch?.[1];
        setResolvedIds(await resolveITBIds(itbConfig, res.details, sutActorId));
        try {
          const actors = await getSpecificationActors(itbConfig);
          const sutActorInfo = actors.find((a: any) => a.actorId === sutActorId)
            || actors.find((a: any) => a.default) || actors[0];
          if (sutActorInfo?.apiKey) {
            const systemApiKey = await ensureSystem(itbConfig);
            if (systemApiKey) await ensureConformance(itbConfig, systemApiKey, sutActorInfo.apiKey);
          }
        } catch { /* best-effort provisioning */ }
      } catch { /* best-effort id resolution */ }
    }

    setResult(res);
    setDeploying(false);
  }, [itbConfig]);

  const runTests = useCallback(async (xmlOutput: XMLOutput) => {
    setRunning(true);
    setTestResults(null);
    try {
      const actors = await getSpecificationActors(itbConfig);
      if (actors.length === 0) {
        setTestResults([{ message: 'No actors found for the specification.' }]);
        return;
      }
      const sutActor = actors.find((a: any) => a.default) || actors[0];
      const systemApiKey = await ensureSystem(itbConfig);
      if (!systemApiKey) {
        setTestResults([{ message: 'Could not create or find a test system.' }]);
        return;
      }
      await ensureConformance(itbConfig, systemApiKey, sutActor.apiKey);
      const testCaseIds = xmlOutput.files
        .filter(f => f.type === 'testcase')
        .map(f => f.filename.replace(/\.xml$/, ''));
      setTestResults(await startTest(itbConfig, testCaseIds, systemApiKey, sutActor.apiKey));

      if (systemApiKey !== itbConfig.systemApiKey) {
        const updated = { ...itbConfig, systemApiKey };
        setITBConfig(updated);
        saveConfig(updated);
      }
    } catch (err: any) {
      setTestResults([{ message: `Error: ${err?.message || err}` }]);
    } finally {
      setRunning(false);
    }
  }, [itbConfig, setITBConfig, saveConfig]);

  return {
    deploying, running, result, testResults,
    appUrl: getITBAppUrl(itbConfig, resolvedIds),
    deploy, runTests, reset,
  };
}
