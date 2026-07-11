export interface DataModel {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  extensions: Record<string, ModelExtension>;
}

export interface ModelExtension {
  id: string;
  name: string;
  description: string;
  stepMappings: Record<string, string>;
}

export interface GherkinScenario {
  name: string;
  steps: GherkinStep[];
  tags?: string[];
}

export interface GherkinStep {
  type: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  line: number;
}

export interface ParsedScenario {
  scenario: GherkinScenario;
  dataModel: DataModel;
  errors: ParseError[];
  warnings: string[];
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface XMLOutput {
  xml: string;
  testcaseName: string;
  scriptlets: Scriptlet[];
}

export interface Scriptlet {
  id: string;
  name: string;
  type: 'validate' | 'informUser' | 'poll' | 'waitForUpload' | 'custom';
  parameters: Record<string, string>;
}

export interface ExampleScenario {
  id: string;
  name: string;
  description: string;
  content: string;
  dataModel: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  type: 'error' | 'warning';
}