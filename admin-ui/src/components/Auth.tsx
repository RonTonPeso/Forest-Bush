import { createContext, useContext, useState, type ReactNode } from 'react';

interface AuthContextType {
  apiKey: string | null;
  login: (key: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
