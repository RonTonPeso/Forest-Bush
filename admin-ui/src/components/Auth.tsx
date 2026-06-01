import { useState, type ReactNode } from 'react';
import { AuthContext } from '../lib/authContext';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    return localStorage.getItem('fb-api-key');
  });

  const login = (key: string) => {
    localStorage.setItem('fb-api-key', key);
    setApiKey(key);
  };

  const logout = () => {
    localStorage.removeItem('fb-api-key');
    setApiKey(null);
  };

  return (
    <AuthContext.Provider value={{ apiKey, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
