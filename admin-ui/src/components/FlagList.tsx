import { type FeatureFlag } from '../lib/api';
import FlagListItem from './FlagListItem';

interface FlagListProps {
  flags: FeatureFlag[];
  onUpdate: (updatedFlag: FeatureFlag) => void;
  onDelete: (key: string) => void;
  onEdit: (flag: FeatureFlag) => void;
}

export default function FlagList({ flags, onUpdate, onDelete, onEdit }: FlagListProps) {
  if (flags.length === 0) {
    return (
      <div className="text-center py-10 px-6 bg-gray-800 rounded-lg">
        <h3 className="text-xl font-semibold text-white">No Feature Flags Found</h3>
        <p className="text-gray-400 mt-2">
          Get started by creating your first feature flag.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {flags.map((flag) => (
        <FlagListItem
          key={flag.key}
          flag={flag}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onEdit={() => onEdit(flag)}
        />
      ))}
    </div>
  );
}
