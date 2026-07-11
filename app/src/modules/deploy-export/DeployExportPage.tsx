import React, { useState } from 'react';
import {
  Rocket, Download, ExternalLink, Play, Loader2,
  CheckCircle, AlertCircle, FileArchive, Globe, Code2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { GherkinEngine } from '../../context/useGherkinEngine';
import {
  deployToITB, ITBDeployResult, getITBAppUrl, resolveITBIds,
  getSpecificationActors, ensureSystem, ensureConformance, startTest, ITBTestResult,
} from '../../services/itbClient';
import JSZip from 'jszip';

interface Props {
  engine: GherkinEngine;
}

export const DeployExportPage: React.FC<Props> = ({ engine }) => {
  const { itbConfig, setITBConfig, saveConfig } = useAppContext();
  const { xmlOutput, errorCount } = engine;

  const { isDark } = useAppContext();
  const [deploying, setDeploying] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<ITBDeployResult | null>(null);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<ITBTestResult[] | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Record<string, number | undefined>>({});

  const handleDeploy = async () => {
    if (!xmlOutput) return;
    setDeploying(true);
    setDeployResult(null);
    setTestResults(null);
    const result = await deployToITB(xmlOutput.files, itbConfig);
    if (result.success && result.details?.completed === false) {
      result.success = false;
      result.message = 'ITB rejected the test suite.';
    }
    if (result.success && result.details) {
      try {
        const suiteFile = xmlOutput.files.find(f => f.type === 'testsuite');
        const tcFile = xmlOutput.files.find(f => f.type === 'testcase');
        const sutMatch = suiteFile?.xml.match(/actor id="([^"]+)"[^>]*role="SUT"/) || tcFile?.xml.match(/actor id="([^"]+)"[^>]*role="SUT"/);
        const sutActorId = sutMatch?.[1];
        const ids = await resolveITBIds(itbConfig, result.details, sutActorId);
        setResolvedIds(ids);
        try {
          const actors = await getSpecificationActors(itbConfig);
          const sutActorInfo = actors.find((a: any) => a.actorId === sutActorId) || actors.find((a: any) => a.default) || actors[0];
          if (sutActorInfo?.apiKey) {
            const systemApiKey = await ensureSystem(itbConfig);
            if (systemApiKey) await ensureConformance(itbConfig, systemApiKey, sutActorInfo.apiKey);
          }
        } catch {}
      } catch {}
    }
    setDeployResult(result);
    setDeploying(false);
  };

  const handleRunTests = async () => {
    if (!xmlOutput) return;
    setRunningTests(true);
    setTestResults(null);
    try {
      const actors = await getSpecificationActors(itbConfig);
      if (actors.length === 0) {
        setTestResults([{ message: 'No actors found for the specification.' }]);
        setRunningTests(false);
        return;
      }
      const sutActor = actors.find((a: any) => a.default) || actors[0];
      const systemApiKey = await ensureSystem(itbConfig);
      if (!systemApiKey) {
        setTestResults([{ message: 'Could not create/find a test system.' }]);
        setRunningTests(false);
        return;
      }
      await ensureConformance(itbConfig, systemApiKey, sutActor.apiKey);
      const testCaseIds = xmlOutput.files
        .filter(f => f.type === 'testcase')
        .map(f => f.filename.replace(/\.xml$/, ''));
      const results = await startTest(itbConfig, testCaseIds, systemApiKey, sutActor.apiKey);
      setTestResults(results);
      if (systemApiKey !== itbConfig.systemApiKey) {
        const updated = { ...itbConfig, systemApiKey };
        setITBConfig(updated);
        saveConfig(updated);
      }
    } catch (err: any) {
      setTestResults([{ message: `Error: ${err?.message || err}` }]);
    }
    setRunningTests(false);
  };

  const handleDownloadZIP = async () => {
    if (!xmlOutput) return;
    const zip = new JSZip();
    for (const file of xmlOutput.files) {
      zip.file(file.filename, file.xml);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${xmlOutput.testcaseName.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ready = !!xmlOutput && errorCount === 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Deploy & Export</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Deploy the compiled test suite to a target or download as a ZIP archive.
          </p>
        </div>

        {/* Readiness check */}
        {!ready && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-sm">
            <AlertCircle size={16} />
            {!xmlOutput ? 'No test case compiled. Write a test in the Tests tab first.' : `${errorCount} error${errorCount > 1 ? 's' : ''} must be fixed before deploying.`}
          </div>
        )}

        {/* Files preview */}
        {xmlOutput && (
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Files ({xmlOutput.files.length})
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {xmlOutput.files.map(f => (
                <div key={f.filename}>
                  <button
                    onClick={() => setExpandedFile(expandedFile === f.filename ? null : f.filename)}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {expandedFile === f.filename ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
                    <FileArchive size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300 flex-1 text-left">{f.filename}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 uppercase">
                      {f.type}
                    </span>
                  </button>
                  {expandedFile === f.filename && (
                    <pre className="mx-4 mb-2 p-3 bg-gray-50 dark:bg-slate-800 rounded text-[10px] font-mono text-gray-600 dark:text-gray-400 overflow-auto max-h-64 whitespace-pre-wrap">
                      {f.xml}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deploy targets */}
        <div className="grid grid-cols-2 gap-4">
          {/* ITB Deploy */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-emerald-600" />
              <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">ITB Deploy</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Deploy to {itbConfig.baseUrl || 'ITB'}
            </p>
            <button
              onClick={handleDeploy}
              disabled={!ready || deploying}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {deploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              {deploying ? 'Deploying...' : 'Deploy to ITB'}
            </button>
          </div>

          {/* ZIP Download */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileArchive size={16} className="text-blue-600" />
              <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">ZIP Download</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Download test suite as a ZIP archive
            </p>
            <button
              onClick={handleDownloadZIP}
              disabled={!ready}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Download size={14} /> Download ZIP
            </button>
          </div>
        </div>

        {/* Deploy result */}
        {deployResult && (
          <div className={`rounded-lg border ${deployResult.success ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'} overflow-hidden`}>
            <div className={`flex items-center gap-2 px-4 py-3 ${
              deployResult.success
                ? 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                : 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200'
            }`}>
              {deployResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span className="font-medium text-sm">{deployResult.success ? 'Deploy Successful' : 'Deploy Failed'}</span>
            </div>
            <div className="px-4 py-3 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">{deployResult.message}</p>

              {/* Errors */}
              {deployResult.details?.errors?.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Errors ({deployResult.details.errors.length})</h4>
                  {deployResult.details.errors.map((err: any, i: number) => (
                    <div key={i} className="px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-800 dark:text-red-300">
                      {err.description}
                      {err.location && <span className="ml-2 opacity-60">in {err.location}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {deployResult.details?.warnings?.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 uppercase">Warnings ({deployResult.details.warnings.length})</h4>
                  {deployResult.details.warnings.map((warn: any, i: number) => (
                    <div key={i} className="px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-800 dark:text-yellow-300">
                      {warn.description}
                    </div>
                  ))}
                </div>
              )}

              {/* Test results */}
              {testResults && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Test Results</h4>
                  {testResults.map((tr, i) => (
                    <div key={i} className={`px-3 py-2 rounded text-xs ${
                      tr.result === 'SUCCESS' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                      : tr.result === 'FAILURE' ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                      : 'bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-300'
                    }`}>
                      {tr.result && <span className="font-semibold mr-1">{tr.result}</span>}
                      {tr.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              {deployResult.success && (
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href={getITBAppUrl(itbConfig, resolvedIds)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink size={14} /> Open in ITB
                  </a>
                  <button
                    onClick={handleRunTests}
                    disabled={runningTests}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                  >
                    {runningTests ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    {runningTests ? 'Running...' : 'Run Tests'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
