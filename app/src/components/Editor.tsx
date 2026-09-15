import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Editor as MonacoEditor, type Monaco } from '@monaco-editor/react';
import type * as monacoNs from 'monaco-editor';
import { ParseError } from '../types';

export interface EditorHandle {
  insertText: (text: string) => void;
  revealLine: (line: number) => void;
  focus: () => void;
}

/** One entry offered by Ctrl+Space after a Given/When/Then keyword. */
export interface StepCompletion {
  /** Human-readable pattern, e.g. `User creates a resource <type> from <file>`. */
  label: string;
  /** Text actually inserted (snippet syntax allowed). */
  insertText: string;
  /** Right-hand hint — the dialect the step comes from. */
  detail?: string;
  documentation?: string;
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
  /** step catalog offered as Ctrl+Space completions */
  completions?: StepCompletion[];
}

export const Editor = forwardRef<EditorHandle, EditorProps>((
  { value, onChange, errors, isDark, highlights, completions }, ref,
) => {
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<monacoNs.editor.IEditorDecorationsCollection | null>(null);
  // The completion provider is registered once but must see the latest catalog,
  // which arrives asynchronously — so it reads through a ref.
  const completionsRef = useRef<StepCompletion[]>([]);
  const [mounted, setMounted] = React.useState(false);

  completionsRef.current = completions ?? [];

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
    revealLine(line: number) {
      const ed = editorRef.current;
      if (!ed) return;
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
      ed.focus();
    },
    focus() {
      editorRef.current?.focus();
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

    // Step completions. Offered on any step line — the catalog is the language,
    // so it belongs at the caret rather than only in a side panel.
    monaco.languages.registerCompletionItemProvider('gherkin', {
      triggerCharacters: [' '],
      provideCompletionItems(model, position) {
        const line = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const m = /^(\s*)(Given|When|Then|And|But)\s+(.*)$/.exec(line);
        if (!m) return { suggestions: [] };

        const typed = m[3];
        const startColumn = position.column - typed.length;
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn,
          endColumn: position.column,
        };

        return {
          suggestions: completionsRef.current.map(c => ({
            label: c.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: c.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: c.detail,
            documentation: c.documentation,
            range,
          })),
        };
      },
    });

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

          // Well-known references: $response.status, $received.body, $validation.errors
          [/\$(response|received|validation)(\.[A-Za-z0-9_-]+)*/, 'variable.reserved'],

          // Variable references: $name, $a.b.c
          [/\$[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)*/, 'variable.ref'],

          // Quoted strings
          [/"[^"]*"/, 'string'],

          // Booleans
          [/\b(true|false)\b/, 'number'],

          // Sentence-shape keywords (bold)
          [/\b(is the system under test|is infrastructure|is available|is an?|is loaded with package|is informed|is asked for|uploads a file|is listening for|receives a request from|replies to|stops listening for|waits for)\b/, 'keyword.verb'],
          [/\b(posts|puts|patches|deletes|gets)\b/, 'keyword.verb'],
          [/\b(should (?:not )?(?:be (?:empty|one of|at least|at most|greater than|less than|a valid)|contain|exist|match(?: pattern)?|satisfy|conform to|equal|be))\b/, 'keyword.verb'],
          [/\b(ignoring (?:slicing errors|errors matching))\b/, 'keyword.verb'],
          [/\b(set|extract|call scriptlet|log|wait)\b/, 'keyword.verb'],
          [/\b(loads IG|validates|evaluates|transforms|generates(?: required)? test data|modifies|parses FML|registers StructureMap|summarizes|scans|decodes|verifies the signature of|extracts (?:metadata|the SHL link) from|authorizes|fetches the FHIR content of|inspects|loads model)\b/, 'keyword.verb'],
          [/\b(from|as|at|with|to|on|using|against|targeting|minus|with pin|with id|with body|with map|times, paced manually)\b/, 'keyword.minor'],
          [/\b(as defined by)\b/, 'keyword.minor'],

          // Actor names: PascalCase word at start of step or after on/to/from/using
          [/[A-Z][A-Za-z0-9_]*(?=\s+(?:is |posts |puts |deletes |patches |gets |loads |validates |evaluates |transforms |generates |modifies |parses |registers |summarizes |scans |decodes |verifies |extracts |authorizes |fetches |inspects |uploads |waits |replies |receives |stops ))/, 'variable.actor'],
          [/(?<=\b(?:on|to|from|using|targeting)\s+)[A-Z][A-Za-z0-9_]*\b/, 'variable.actor'],

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
    <div className="h-full overflow-hidden">
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
