import { useEffect, useState } from 'react';
import { useAuth } from '../components/Auth';
import CreateFlagModal from '../components/CreateFlagModal';
import EditFlagModal from '../components/EditFlagModal';
import FlagList from '../components/FlagList';
import { apiClient, type FeatureFlag } from '../lib/api';

export default function DashboardPage() {
  const { apiKey, logout } = useAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);

  const fetchFlags = async (key: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedFlags = await apiClient.getFlags(key);
      setFlags(fetchedFlags);
    } catch (err) {
      setError('Failed to fetch flags. Please check your API key and network connection.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (apiKey) {
      fetchFlags(apiKey);
    } else {
      setError('API key is missing.');
      setIsLoading(false);
    }
  }, [apiKey]);

  const handleUpdateFlag = (updatedFlag: FeatureFlag) => {
    setFlags((currentFlags) =>
      currentFlags.map((f) => (f.key === updatedFlag.key ? updatedFlag : f))
    );
  };

  const handleDeleteFlag = (key: string) => {
    setFlags((currentFlags) => currentFlags.filter((f) => f.key !== key));
  };

  const handleCreateFlag = (newFlag: FeatureFlag) => {
    setFlags((currentFlags) => [newFlag, ...currentFlags]);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 shadow-md p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={logout}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition-colors duration-200"
        >
          Logout
        </button>
      </header>
      <main className="p-8 max-w-4xl mx-auto">
        {isLoading && <p className="text-center">Loading flags...</p>}
        {error && <p className="text-red-500 text-center">{error}</p>}
        {!isLoading && !error && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-semibold">All Feature Flags</h2>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline transition-colors"
              >
                + Add New Flag
              </button>
            </div>
            <FlagList
              flags={flags}
              onUpdate={handleUpdateFlag}
              onDelete={handleDeleteFlag}
              onEdit={(flag) => setEditingFlag(flag)}
            />
          </div>
        )}
      </main>
      {apiKey && (
        <>
          <CreateFlagModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreate={handleCreateFlag}
            apiCall={(data) => apiClient.createFlag(apiKey, data)}
          />
          <EditFlagModal
            isOpen={!!editingFlag}
            onClose={() => setEditingFlag(null)}
            onUpdate={handleUpdateFlag}
            flag={editingFlag}
            apiCall={(key, data) => apiClient.updateFlag(apiKey, key, data)}
          />
        </>
      )}
    </div>
  );
}
