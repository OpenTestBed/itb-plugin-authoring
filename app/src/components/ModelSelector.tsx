import React from 'react';
import { ChevronDown } from 'lucide-react';
import { DataModel } from '../../types';

interface ModelSelectorProps {
  models: DataModel[];
  selectedModel: DataModel;
  onModelChange: (model: DataModel) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModel,
  onModelChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-left bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {selectedModel.name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {selectedModel.description}
          </div>
        </div>
        <ChevronDown 
          size={20} 
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onModelChange(model);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  model.id === selectedModel.id 
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' 
                    : ''
                }`}
              >
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {model.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {model.description}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {Object.keys(model.extensions).length} extensions available
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};