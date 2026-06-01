import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Eye, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import ToggleSwitch from './ToggleSwitch';
import { apiClient, type FeatureFlag } from '../lib/api';

interface FlagListItemProps {
  flag: FeatureFlag;
  onUpdate: (updatedFlag: FeatureFlag) => void;
  onDelete: (key: string, environment: FeatureFlag['environment']) => void;
  onEdit: () => void;
}

export default function FlagListItem({ flag, onUpdate, onDelete, onEdit }: FlagListItemProps) {
  const { apiKey } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async (newEnabledState: boolean) => {
    if (!apiKey) {
      toast.error('API Key is not configured.');
      return;
    }
    setIsUpdating(true);
    try {
      const updatedFlag = await apiClient.updateFlag(apiKey, flag.key, {
        enabled: newEnabledState,
      }, flag.environment);
      onUpdate(updatedFlag);
      toast.success(`Flag "${flag.key}" ${newEnabledState ? 'enabled' : 'disabled'}.`);
    } catch {
      toast.error('Failed to update flag. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!apiKey) {
      toast.error('API Key is not configured.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete the flag "${flag.key}"? This cannot be undone.`)) {
      setIsUpdating(true);
      try {
        await apiClient.deleteFlag(apiKey, flag.key, flag.environment);
        onDelete(flag.key, flag.environment);
        toast.success(`Flag "${flag.key}" deleted.`);
      } catch {
        toast.error('Failed to delete flag. Please try again.');
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md hover:bg-gray-700 transition-colors duration-200">
      <div className="flex items-center justify-between">
        <div className="flex-grow pr-4">
          <h3 className="font-bold text-lg text-white break-all">{flag.key}</h3>
          <p className="text-sm text-gray-400 mt-1">{flag.description}</p>
        </div>
        <div className="flex items-center space-x-4 flex-shrink-0">
          <ToggleSwitch enabled={flag.enabled} onChange={handleToggle} disabled={isUpdating} />
          <button
            onClick={onEdit}
            disabled={isUpdating}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="View flag details"
          >
            <Eye size={18} />
          </button>
          <button
            onClick={handleDelete}
            disabled={isUpdating}
            className="p-2 text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
            aria-label="Delete flag"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        Environment: {flag.environment} | Rollout: {flag.rules?.rolloutPercentage ?? 0}%
      </div>
    </div>
  );
}
