import { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { apiClient } from '../lib/api';
import { Lock, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key) {
      setError('API Key cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const isValid = await apiClient.verifyApiKey(key);

    if (isValid) {
      login(key);
    } else {
      setError('Invalid API Key. Please check and try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col items-center justify-center bg-gray-900 p-12 text-white">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tighter">Forest Bush</h1>
          <p className="mt-4 text-lg text-gray-400">
            The open-source feature flag platform.
          </p>
        </div>
        <div className="mt-16 text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Forest Bush Project
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-gray-800">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-3xl font-bold text-white">Admin Login</h1>
            <p className="text-gray-400">Enter your credentials to access the dashboard.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="apiKey" className="text-sm font-medium text-gray-300">
                API Key
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                <input
                  id="apiKey"
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="••••••••••••••••"
                  disabled={isLoading}
                />
              </div>
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center bg-red-900/50 p-3 rounded-md">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-all duration-300 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? (
                'Verifying...'
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Secure Login
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
