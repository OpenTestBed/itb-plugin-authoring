import React from 'react';
import { ExternalLink, Copy } from 'lucide-react';
import { ExampleScenario, DataModel } from '../types';

interface ExamplesPanelProps {
  examples: ExampleScenario[];
  selectedModel: DataModel;
  onExampleSelect: (example: ExampleScenario) => void;
}

export const ExamplesPanel: React.FC<ExamplesPanelProps> = ({
  examples,
  selectedModel,
  onExampleSelect,
}) => {
  const filteredExamples = examples.filter(
    example => example.dataModel === selectedModel.id
  );

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopyExample = async (example: ExampleScenario, event: React.MouseEvent) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(example.content);
    setCopiedId(example.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Example Scenarios
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Click on an example to load it into the editor
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredExamples.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-gray-500 dark:text-gray-400">
              No examples available for {selectedModel.name}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredExamples.map((example) => (
              <div
                key={example.id}
                onClick={() => onExampleSelect(example)}
                className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {example.name}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {example.description}
                    </p>
                    
                    {/* Preview of content */}
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded border text-xs font-mono text-gray-700 dark:text-gray-300">
                      {example.content.split('\n').slice(0, 3).join('\n')}
                      {example.content.split('\n').length > 3 && '\n...'}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleCopyExample(example, e)}
                    className="ml-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy to clipboard"
                  >
                    <Copy size={16} />
                    {copiedId === example.id && (
                      <span className="absolute -top-8 -left-4 bg-black text-white text-xs px-2 py-1 rounded">
                        Copied!
                      </span>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Data Model Extensions Info */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            {selectedModel.name} Extensions
          </h4>
          <div className="space-y-3">
            {Object.values(selectedModel.extensions).map((extension) => (
              <div key={extension.id} className="text-sm">
                <div className="font-medium text-blue-800 dark:text-blue-200">
                  {extension.id} - {extension.name}
                </div>
                <div className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  {extension.description}
                </div>
                <div className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                  Patterns: {Object.keys(extension.stepMappings).length} supported
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
            <ExternalLink size={16} />
            Quick Reference
          </h4>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <div>
              <strong>Step Keywords:</strong> Given, When, Then, And, But
            </div>
            <div>
              <strong>Resource Types:</strong> Patient, Observation, Practitioner, Organization, Encounter
            </div>
            <div>
              <strong>Validation:</strong> Use URLs like http://hl7.org/fhir/StructureDefinition/Patient
            </div>
            <div>
              <strong>Messages:</strong> Use quotes for user messages: "Resource is valid"
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};