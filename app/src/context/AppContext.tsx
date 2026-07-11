import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ITBConfig, loadITBConfig, saveITBConfig } from '../services/itbClient';
import { GherkinParser } from '../parser/gherkinParser';
import { XMLGenerator } from '../parser/xmlGenerator';
import { dataModels } from '../data/models';
import { DataModel } from '../types';

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

  const saveConfig = (config: ITBConfig) => {
    setITBConfig(config);
    saveITBConfig(config);
  };

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
    [selectedModel]
  );
  const generator = useMemo(() => new XMLGenerator(parser), [parser]);

  return (
    <AppContext.Provider value={{
      isDark, setIsDark,
      selectedModel, setSelectedModel,
      itbConfig, setITBConfig, saveConfig, itbSettingsOpen, setITBSettingsOpen,
      parser, generator,
    }}>
      {children}
    </AppContext.Provider>
  );
};
