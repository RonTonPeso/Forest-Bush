import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { type FeatureFlag } from '../lib/api';

interface EditFlagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedFlag: FeatureFlag) => void;
  flag: FeatureFlag | null;
  apiCall: (key: string, data: { rules: { rolloutPercentage: number } }) => Promise<FeatureFlag>;
}

export default function EditFlagModal({ isOpen, onClose, onUpdate, flag, apiCall }: EditFlagModalProps) {
  const [rolloutPercentage, setRolloutPercentage] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (flag) {
      setRolloutPercentage(flag.rules?.rolloutPercentage ?? 0);
    }
  }, [flag]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flag) return;

    setIsUpdating(true);
    try {
      const updatedFlag = await apiCall(flag.key, { rules: { rolloutPercentage } });
      onUpdate(updatedFlag);
      toast.success(`Flag "${flag.key}" updated successfully!`);
      onClose();
    } catch {
      toast.error('Failed to update rollout percentage.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-2">Edit Flag: {flag?.key}</h2>
        <p className="text-gray-400 mb-6">Adjust the rollout percentage for this feature flag.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="rollout" className="block text-gray-300 font-bold mb-2">
              Rollout Percentage
            </label>
            <div className="flex items-center space-x-4">
              <input
                id="rollout"
                type="range"
                min="0"
                max="100"
                value={rolloutPercentage}
                onChange={(e) => setRolloutPercentage(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                disabled={isUpdating}
              />
              <span className="text-white font-semibold w-12 text-center">{rolloutPercentage}%</span>
            </div>
          </div>
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isUpdating}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
