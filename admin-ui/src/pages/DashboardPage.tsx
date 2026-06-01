import { useEffect, useState } from 'react';
import { useAuth } from '../lib/authContext';
import CreateFlagModal from '../components/CreateFlagModal';
import FlagList from '../components/FlagList';
import FlagDetailPage from './FlagDetailPage';
import { apiClient, DEFAULT_ENVIRONMENT, ENVIRONMENTS, type Environment, type FeatureFlag } from '../lib/api';

export default function DashboardPage() {
  const { apiKey, logout } = useAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [environment, setEnvironment] = useState<Environment>(DEFAULT_ENVIRONMENT);

  const fetchFlags = async (key: string, selectedEnvironment: Environment) => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedFlags = await apiClient.getFlags(key, selectedEnvironment);
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
      fetchFlags(apiKey, environment);
    } else {
      setError('API key is missing.');
      setIsLoading(false);
    }
  }, [apiKey, environment]);

  const handleUpdateFlag = (updatedFlag: FeatureFlag) => {
    setFlags((currentFlags) =>
      currentFlags.map((f) => (f.key === updatedFlag.key && f.environment === updatedFlag.environment ? updatedFlag : f))
    );
    setSelectedFlag((currentFlag) => {
      if (!currentFlag) return currentFlag;
      return currentFlag.key === updatedFlag.key && currentFlag.environment === updatedFlag.environment
        ? updatedFlag
        : currentFlag;
    });
  };

  const handleDeleteFlag = (key: string, deletedEnvironment: Environment) => {
    setFlags((currentFlags) => currentFlags.filter((f) => f.key !== key || f.environment !== deletedEnvironment));
    setSelectedFlag((currentFlag) => {
      if (!currentFlag) return currentFlag;
      return currentFlag.key === key && currentFlag.environment === deletedEnvironment ? null : currentFlag;
    });
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
        {!isLoading && !error && selectedFlag && (
          <FlagDetailPage
            apiKey={apiKey || ''}
            flag={selectedFlag}
            onBack={() => setSelectedFlag(null)}
            onUpdate={handleUpdateFlag}
          />
        )}
        {!isLoading && !error && !selectedFlag && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-3xl font-semibold">All Feature Flags</h2>
                <label className="block text-sm text-gray-400 mt-3">
                  Environment
                  <select
                    value={environment}
                    onChange={(event) => {
                      setSelectedFlag(null);
                      setEnvironment(event.target.value as Environment);
                    }}
                    className="ml-3 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
                  >
                    {ENVIRONMENTS.map((env) => (
                      <option key={env} value={env}>
                        {env}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
              onEdit={(flag) => setSelectedFlag(flag)}
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
            environment={environment}
            apiCall={(data) => apiClient.createFlag(apiKey, { ...data, environment })}
          />
        </>
      )}
    </div>
  );
}
