import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Editor as MonacoEditor, type Monaco } from '@monaco-editor/react';
import type * as monacoNs from 'monaco-editor';
import { ParseError } from '../types';

export interface EditorHandle {
  insertText: (text: string) => void;
}

/** A step (line range) provided by a plugin dialect rather than the core language. */
export interface StepHighlight {
  line: number;
  startColumn: number;
  endColumn: number;
  componentId: string;
  componentName: string;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  errors: ParseError[];
  isDark: boolean;
  /** plugin-dialect steps to render distinctly (base language keeps token colors) */
  highlights?: StepHighlight[];
}

export const Editor = forwardRef<EditorHandle, EditorProps>(({ value, onChange, errors, isDark, highlights }, ref) => {
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<monacoNs.editor.IEditorDecorationsCollection | null>(null);
  const [mounted, setMounted] = React.useState(false);

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const ed = editorRef.current;
      const m = monacoRef.current;
      if (!ed || !m) return;
      const pos = ed.getPosition();
      if (!pos) return;
      const range = new m.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
      ed.executeEdits('snippet', [{ range, text: text + '\n' }]);
      ed.focus();
    },
  }));

  // Apply theme changes when isDark changes
  useEffect(() => {
    const m = monacoRef.current;
    if (m && editorRef.current) {
      m.editor.setTheme(isDark ? 'gherkin-theme-dark' : 'gherkin-theme-light');
    }
  }, [isDark]);

  // Plugin-dialect step decorations: base language keeps its Monarch token
  // colors; steps matched to a plugin component get an inline class per
  // component id (colors in App.css) + a hover naming the plugin.
  useEffect(() => {
    const ed = editorRef.current;
    const m = monacoRef.current;
    if (!ed || !m) return;
    const decos = (highlights ?? []).map(h => ({
      range: new m.Range(h.line, h.startColumn, h.line, h.endColumn),
      options: {
        inlineClassName: `plugin-step plugin-step--${h.componentId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        hoverMessage: { value: `**Plugin step** — provided by \`${h.componentName}\` (${h.componentId})` },
      },
    }));
    decorationsRef.current?.clear();
    decorationsRef.current = ed.createDecorationsCollection(decos);
  }, [highlights, mounted]);

  useEffect(() => {
    const m = monacoRef.current;
    if (m && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        m.editor.setModelMarkers(model, 'gherkin-parser', []);

        const markers = errors.map(error => ({
          startLineNumber: error.line ?? 1,
          startColumn: error.column ?? 1,
          endLineNumber: error.line ?? 1,
          endColumn: (error.column ?? 1) + 10,
          message: error.message,
          severity: error.severity === 'error'
            ? m.MarkerSeverity.Error
            : m.MarkerSeverity.Warning,
        }));

        m.editor.setModelMarkers(model, 'gherkin-parser', markers);
      }
    }
  }, [errors]);

  const handleBeforeMount = (monaco: Monaco) => {
    monacoRef.current = monaco;

    // Register Gherkin language
    monaco.languages.register({ id: 'gherkin' });

    // Monarch tokenizer for FHIR Gherkin Dialect
    monaco.languages.setMonarchTokensProvider('gherkin', {
      tokenizer: {
        root: [
          // Comments
          [/^\s*#.*$/, 'comment'],

          // Structural keywords
          [/^\s*Feature:.*$/, 'keyword.feature'],
          [/^\s*Background:/, 'keyword.background'],
          [/^\s*Scenario Outline:.*$/, 'keyword.scenario'],
          [/^\s*Scenario:.*$/, 'keyword.scenario'],

          // Tags
          [/^\s*@\S+/, 'tag'],

          // Doc strings
          [/^\s*"""/, { token: 'string.docstring', next: '@docstring' }],

          // Table rows
          [/^\s*\|/, { token: 'delimiter.table', next: '@table' }],

          // Step keywords
          [/^\s*(Given|When|Then|And|But)\b/, { token: 'keyword.step', next: '@stepContent' }],

          // Strings
          [/"[^"]*"/, 'string'],
          [/\b[0-9]+\b/, 'number'],
        ],

        stepContent: [
          [/$/, '', '@pop'],

          // Quoted strings — check for reserved names
          [/"(response status|response body|response|validation errors|validation warnings|validation outcome|validation severity)"/, 'variable.reserved'],

          // Regular quoted strings
          [/"[^"]*"/, 'string'],

          // URLs
          [/https?:\/\/[^\s"]+/, 'url'],

          // Dialect verbs (bold keywords within steps)
          [/\b(is the system under test|is available|is loaded with package|is informed|is asked for)\b/, 'keyword.verb'],
          [/\b(posts to|puts to|deletes on|patches on|gets)\b/, 'keyword.verb'],
          [/\b(should be|should not be|should contain|should not be empty|should NOT match)\b/, 'keyword.verb'],
          [/\b(set|extract|from|as|at|with|to)\b/, 'keyword.minor'],
          [/\b(validate|evaluate FHIRPath|on|and expect|exists|count is)\b/, 'keyword.verb'],
          [/\b(partially match|exactly match|against)\b/, 'keyword.verb'],
          [/\b(generate test data from profile|define mappings|define data|with parts)\b/, 'keyword.verb'],
          [/\b(the validation should pass|the validation should fail)\b/, 'keyword.verb'],
          [/\b(if|then|is not empty|is empty)\b/, 'keyword.verb'],
          [/\b(set header|log|inform)\b/, 'keyword.verb'],
          [/\b(as defined by)\b/, 'keyword.minor'],

          // Actor names: capitalized words at start of step or before verbs
          [/[A-Z][A-Za-z0-9_]*(?=\s+(?:is |posts |puts |deletes |patches |gets |calls ))/, 'variable.actor'],
          [/(?<=to\s+)[A-Z][A-Za-z0-9_]*(?=\s+at\b)/, 'variable.actor'],

          // Variable references: $varName
          [/\$[A-Za-z_][A-Za-z0-9_]*/, 'variable.ref'],

          // Numbers
          [/\b[0-9]+\b/, 'number'],

          [/./, ''],
        ],

        docstring: [
          [/^\s*"""/, { token: 'string.docstring', next: '@pop' }],
          [/.*/, 'string.docstring'],
        ],

        table: [
          [/[^|\r\n]+/, 'string.table'],
          [/\|/, 'delimiter.table'],
          [/$/, '', '@pop'],
        ],
      },
    });

    // Dark theme
    monaco.editor.defineTheme('gherkin-theme-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.feature', foreground: '569cd6', fontStyle: 'bold' },
        { token: 'keyword.background', foreground: '569cd6', fontStyle: 'bold' },
        { token: 'keyword.scenario', foreground: '4ec9b0', fontStyle: 'bold' },
        { token: 'keyword.step', foreground: 'c586c0' },
        { token: 'keyword.verb', foreground: '569cd6' },
        { token: 'keyword.minor', foreground: '808080' },
        { token: 'tag', foreground: '608b4e' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'string.docstring', foreground: 'ce9178', fontStyle: 'italic' },
        { token: 'string.table', foreground: 'dcdcaa' },
        { token: 'delimiter.table', foreground: '808080' },
        { token: 'url', foreground: '4fc1ff', fontStyle: 'underline' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'variable.actor', foreground: '9cdcfe', fontStyle: 'bold' },
        { token: 'variable.reserved', foreground: 'dcdcaa', fontStyle: 'italic' },
        { token: 'variable.ref', foreground: '9cdcfe' },
        { token: 'comment', foreground: '6a9955' },
      ],
      colors: {
        'editor.background': '#1f2937',
        'editor.foreground': '#d4d4d4',
        'editorLineNumber.foreground': '#6b7280',
        'editorLineNumber.activeForeground': '#9ca3af',
        'editor.lineHighlightBackground': '#374151',
        'editor.selectionBackground': '#4b5563',
        'editorGutter.background': '#111827',
        'editor.inactiveSelectionBackground': '#4b5563',
        'editorIndentGuide.background': '#374151',
        'editorIndentGuide.activeBackground': '#4b5563',
        'editorRuler.foreground': '#374151',
      },
    });

    // Light theme
    monaco.editor.defineTheme('gherkin-theme-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword.feature', foreground: '0000ff', fontStyle: 'bold' },
        { token: 'keyword.background', foreground: '0000ff', fontStyle: 'bold' },
        { token: 'keyword.scenario', foreground: '0451a5', fontStyle: 'bold' },
        { token: 'keyword.step', foreground: 'af00db' },
        { token: 'keyword.verb', foreground: '0000ff' },
        { token: 'keyword.minor', foreground: '808080' },
        { token: 'tag', foreground: '008000' },
        { token: 'string', foreground: 'a31515' },
        { token: 'string.docstring', foreground: 'a31515', fontStyle: 'italic' },
        { token: 'string.table', foreground: '795e26' },
        { token: 'delimiter.table', foreground: '808080' },
        { token: 'url', foreground: '0000ff', fontStyle: 'underline' },
        { token: 'number', foreground: '098658' },
        { token: 'variable.actor', foreground: '001080', fontStyle: 'bold' },
        { token: 'variable.reserved', foreground: '795e26', fontStyle: 'italic' },
        { token: 'variable.ref', foreground: '001080' },
        { token: 'comment', foreground: '008000' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editorLineNumber.foreground': '#6b7280',
        'editorLineNumber.activeForeground': '#111827',
        'editorGutter.background': '#f9fafb',
      },
    });
  };

  const handleEditorDidMount = (editor: monacoNs.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    setMounted(true);

    editor.updateOptions({
      fontSize: 14,
      lineHeight: 21,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      folding: true,
      lineNumbers: 'on',
      glyphMargin: true,
    });
  };

  return (
    <div className="h-full border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      <MonacoEditor
        height="100%"
        language="gherkin"
        theme={isDark ? 'gherkin-theme-dark' : 'gherkin-theme-light'}
        value={value}
        onChange={(value) => onChange(value || '')}
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        options={{
          automaticLayout: true,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          wordWrap: 'on',
        }}
      />
    </div>
  );
});
