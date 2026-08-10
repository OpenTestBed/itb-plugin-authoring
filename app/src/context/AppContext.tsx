import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ITBConfig, loadITBConfig, saveITBConfig, checkITBHealth } from '../services/itbClient';
import { GherkinParser } from '../parser/gherkinParser';
import { XMLGenerator } from '../parser/xmlGenerator';
import { dataModels } from '../data/models';
import { DataModel } from '../types';
import {
  FileSource, FileSourceKind, bundledSource, serverSource, localSource, serverAvailable,
} from '../services/fileSources';
import { localFsSupported, pickDirectory, restoreDirectory, forgetDirectory } from '../services/localFs';

export type ITBStatus = 'unconfigured' | 'checking' | 'connected' | 'unreachable';

interface AppContextType {
  // Theme
  isDark: boolean;
  setIsDark: (v: boolean) => void;

  // Data model
  selectedModel: DataModel;
  setSelectedModel: (m: DataModel) => void;

  // ITB config
  itbConfig: ITBConfig;
  setITBConfig: (c: ITBConfig) => void;
  saveConfig: (c: ITBConfig) => void;
  itbSettingsOpen: boolean;
  setITBSettingsOpen: (v: boolean) => void;

  // ── Capabilities ──────────────────────────────────────────────────
  /** The authoring-plugin server is answering /api/features. */
  hasServerFiles: boolean;
  /** This browser can open a local folder (Chromium + secure context). */
  hasLocalFs: boolean;
  /** Liveness of the configured test bed. */
  itbStatus: ITBStatus;
  recheckITB: () => void;

  // ── Where files come from ─────────────────────────────────────────
  sourceKind: FileSourceKind;
  source: FileSource;
  /** Set to 'local' only succeeds once a folder is granted; use pickLocalFolder. */
  setSourceKind: (k: FileSourceKind) => void;
  localDirName: string | null;
  pickLocalFolder: () => Promise<boolean>;
  closeLocalFolder: () => Promise<void>;
  /** Bumped whenever the file list should be reloaded. */
  filesVersion: number;
  refreshFiles: () => void;

  // Plugin dialects: bumped whenever the set of dialect URLs changes so the
  // parser and catalog consumers reload without a page refresh
  dialectsVersion: number;
  refreshDialects: () => void;

  // Parser & generator (shared instances)
  parser: GherkinParser;
  generator: XMLGenerator;
}

const AppContext = createContext<AppContextType>(null!);

export const useAppContext = () => useContext(AppContext);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = window.localStorage?.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  });

  const [selectedModel, setSelectedModel] = useState<DataModel>(dataModels[0]);
  const [itbConfig, setITBConfig] = useState<ITBConfig>(loadITBConfig);
  const [itbSettingsOpen, setITBSettingsOpen] = useState(false);
  const [dialectsVersion, setDialectsVersion] = useState(0);
  const refreshDialects = useCallback(() => setDialectsVersion(v => v + 1), []);

  const [hasServerFiles, setHasServerFiles] = useState(false);
  const [hasLocalFs] = useState(localFsSupported);
  const [itbStatus, setITBStatus] = useState<ITBStatus>('unconfigured');
  const [sourceKind, setSourceKindState] = useState<FileSourceKind>('bundled');
  const [localDir, setLocalDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [filesVersion, setFilesVersion] = useState(0);
  const refreshFiles = useCallback(() => setFilesVersion(v => v + 1), []);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      document.body.style.backgroundColor = '#0f172a';
      document.body.style.color = '#f9fafb';
    } else {
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f8fafc';
      document.body.style.color = '#111827';
    }
    window.localStorage?.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Pick the best available file source once, at startup:
  // the plugin server if it answers, else a previously granted folder, else bundled.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = await serverAvailable();
      if (cancelled) return;
      setHasServerFiles(server);
      if (server) { setSourceKindState('server'); return; }

      const dir = await restoreDirectory(false);
      if (cancelled) return;
      if (dir) { setLocalDir(dir); setSourceKindState('local'); return; }

      setSourceKindState('bundled');
    })();
    return () => { cancelled = true; };
  }, []);

  // Probe the test bed whenever its base URL changes.
  const recheckITB = useCallback(() => {
    const url = itbConfig.baseUrl?.trim();
    if (!url) { setITBStatus('unconfigured'); return; }
    setITBStatus('checking');
    checkITBHealth(url)
      .then(r => setITBStatus(r.ok ? 'connected' : 'unreachable'))
      .catch(() => setITBStatus('unreachable'));
  }, [itbConfig.baseUrl]);

  useEffect(() => { recheckITB(); }, [recheckITB]);

  const saveConfig = useCallback((config: ITBConfig) => {
    setITBConfig(config);
    saveITBConfig(config);
  }, []);

  const pickLocalFolder = useCallback(async () => {
    const dir = await pickDirectory();
    if (!dir) return false;
    setLocalDir(dir);
    setSourceKindState('local');
    refreshFiles();
    return true;
  }, [refreshFiles]);

  const closeLocalFolder = useCallback(async () => {
    await forgetDirectory();
    setLocalDir(null);
    setSourceKindState(hasServerFiles ? 'server' : 'bundled');
    refreshFiles();
  }, [hasServerFiles, refreshFiles]);

  const setSourceKind = useCallback((k: FileSourceKind) => {
    if (k === 'local' && !localDir) { void pickLocalFolder(); return; }
    setSourceKindState(k);
    refreshFiles();
  }, [localDir, pickLocalFolder, refreshFiles]);

  const source = useMemo<FileSource>(() => {
    if (sourceKind === 'server' && hasServerFiles) return serverSource();
    if (sourceKind === 'local' && localDir) return localSource(localDir);
    return bundledSource();
  }, [sourceKind, hasServerFiles, localDir]);

  // Parser & generator
  const parser = useMemo(
    () =>
      new GherkinParser(selectedModel, {
        services: {
          'FHIR-validator': '1.2.0',
          'Monitor': '2.0.1',
          'UploadProxy': '1.6.0',
          'ProxyTrafficProcessor': '1.0.0',
        },
        strictRequirements: false,
      }),
    // dialectsVersion: a fresh parser re-runs ensureCatalog, picking up
    // newly added/removed plugin dialect URLs
    [selectedModel, dialectsVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const generator = useMemo(() => new XMLGenerator(parser), [parser]);

  return (
    <AppContext.Provider value={{
      isDark, setIsDark,
      selectedModel, setSelectedModel,
      itbConfig, setITBConfig, saveConfig, itbSettingsOpen, setITBSettingsOpen,
      hasServerFiles, hasLocalFs, itbStatus, recheckITB,
      sourceKind, source, setSourceKind,
      localDirName: localDir?.name ?? null,
      pickLocalFolder, closeLocalFolder,
      filesVersion, refreshFiles,
      dialectsVersion, refreshDialects,
      parser, generator,
    }}>
      {children}
    </AppContext.Provider>
  );
};
