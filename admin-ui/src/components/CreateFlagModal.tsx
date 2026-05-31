import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { type FeatureFlag } from '../lib/api';

interface CreateFlagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (newFlag: FeatureFlag) => void;
  apiCall: (data: { key: string; description: string }) => Promise<FeatureFlag>;
}

export default function CreateFlagModal({ isOpen, onClose, onCreate, apiCall }: CreateFlagModalProps) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError('Key is required.');
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const newFlag = await apiCall({ key, description });
      onCreate(newFlag);
      toast.success(`Flag "${key}" created successfully!`);
      onClose();
      setKey('');
      setDescription('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
      toast.error(message || 'Failed to create flag.');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-6">Create New Feature Flag</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="key" className="block text-gray-300 font-bold mb-2">
              Key
            </label>
            <input
              id="key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., new-checkout-flow"
              disabled={isCreating}
            />
          </div>
          <div className="mb-6">
            <label htmlFor="description" className="block text-gray-300 font-bold mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="A brief explanation of what this flag controls."
              rows={3}
              disabled={isCreating}
            />
          </div>
          {error && <p className="text-red-500 text-center mb-4">{error}</p>}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create Flag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
