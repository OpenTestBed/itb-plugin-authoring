// src/components/OutputPanel.tsx - Updated with validation
import React, { useRef, useState, useEffect } from 'react';
import { Copy, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { XMLOutput } from '../parser/xmlGenerator';
import { ParseError } from '../types';
import { ValidationResult } from '../../types';
import { GITBValidator } from '../validation/gitbValidator.ts';

interface OutputPanelProps {
  xmlOutput: XMLOutput | null;
  errors: ParseError[];
  isDark: boolean;
  onDownload: () => void;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({ 
  xmlOutput, 
  errors, 
  isDark, 
  onDownload 
}) => {
  const [copied, setCopied] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const validator = useRef<GITBValidator | null>(null);

  // Initialize validator
  useEffect(() => {
    validator.current = new GITBValidator();
    validator.current.loadSchemas().catch(console.error);
  }, []);

  // Validate XML when output changes — validate each file individually
  useEffect(() => {
    if (xmlOutput && validator.current) {
      setIsValidating(true);
      Promise.all(
        xmlOutput.files.map(f => validator.current!.validateXML(f.xml))
      ).then(results => {
        const allErrors = results.flatMap((r, i) =>
          r.errors.map(e => ({ ...e, message: `[${xmlOutput.files[i].filename}] ${e.message}` }))
        );
        setValidationResult({
          valid: results.every(r => r.valid),
          errors: allErrors
        });
        setIsValidating(false);
      }).catch(error => {
        console.error('Validation failed:', error);
        setIsValidating(false);
      });
    }
  }, [xmlOutput]);

  // Reset selected file when output changes
  useEffect(() => {
    setSelectedFileIdx(0);
  }, [xmlOutput]);

  const selectedFile = xmlOutput?.files[selectedFileIdx];

  const handleCopy = () => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasErrors = errors.some(e => e.severity === 'error');

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Compiled Test Suite
          </h2>
          <div className="flex items-center gap-3">
            {/* Validation Status */}
            {xmlOutput && (
              <div className="flex items-center gap-2">
                {isValidating ? (
                  <span className="text-sm text-gray-500">Validating...</span>
                ) : validationResult ? (
                  <div className={`flex items-center gap-1 text-sm ${
                    validationResult.valid 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {validationResult.valid ? (
                      <>
                        <CheckCircle size={16} />
                        Valid GITB XML
                      </>
                    ) : (
                      <>
                        <AlertCircle size={16} />
                        {validationResult.errors.filter(e => e.type === 'error').length} validation errors
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Error/Warning Count */}
            <div className="flex items-center gap-2 text-sm">
              {errors.filter(e => e.severity === 'error').length > 0 && (
                <span className="text-red-500">
                  <AlertCircle size={16} className="inline mr-1" />
                  {errors.filter(e => e.severity === 'error').length} errors
                </span>
              )}
              {errors.filter(e => e.severity === 'warning').length > 0 && (
                <span className="text-yellow-500">
                  <AlertCircle size={16} className="inline mr-1" />
                  {errors.filter(e => e.severity === 'warning').length} warnings
                </span>
              )}
            </div>

            {/* Actions */}
            <button
              onClick={handleCopy}
              className="btn-secondary flex items-center gap-2"
              disabled={!xmlOutput || hasErrors}
            >
              <Copy size={16} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onDownload}
              className="btn-primary flex items-center gap-2"
              disabled={!xmlOutput || hasErrors}
            >
              <Download size={16} />
              Download ZIP
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        {hasErrors ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Compilation Failed
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Fix the errors in your scenario before compiling.
              </p>
              <div className="text-left max-w-2xl mx-auto space-y-2">
                {errors.filter(e => e.severity === 'error').map((error, index) => (
                  <div key={index} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-red-700 dark:text-red-300">
                      Line {error.line}: {error.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : xmlOutput ? (
          <div className="h-full flex flex-col">
            {/* Test Suite / Test Case Info */}
            <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Test Suite: {xmlOutput.testcaseName}
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Files:</span>{' '}
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {xmlOutput.files.length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Test Cases:</span>{' '}
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {xmlOutput.files.filter(f => f.type === 'testcase').length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Total Size:</span>{' '}
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {(xmlOutput.files.reduce((sum, f) => sum + new Blob([f.xml]).size, 0) / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>
            </div>

            {/* File Tabs */}
            <div className="mb-2 flex flex-wrap gap-1">
              {xmlOutput.files.map((file, idx) => (
                <button
                  key={file.filename}
                  onClick={() => setSelectedFileIdx(idx)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors ${
                    idx === selectedFileIdx
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                    file.type === 'testsuite' ? 'bg-purple-500' : 'bg-green-500'
                  }`} />
                  {file.filename}
                </button>
              ))}
            </div>

            {/* Validation Errors (if any) */}
            {validationResult && !validationResult.valid && (
              <div className="mb-4 space-y-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  GITB Schema Validation Issues:
                </h4>
                {validationResult.errors.map((error, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      error.type === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                    }`}
                  >
                    {error.line && <span className="font-medium">Line {error.line}: </span>}
                    {error.message}
                  </div>
                ))}
              </div>
            )}

            {/* XML Display for selected file */}
            {selectedFile && (
              <div className="flex-1 min-h-0 overflow-auto bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <pre className="p-4 text-sm text-gray-100 font-mono whitespace-pre overflow-x-auto">
                  {selectedFile.xml}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>No output yet. Write a scenario and click Compile.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};