import { useAuth } from './lib/authContext';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import { Toaster } from 'react-hot-toast';

function App() {
  const { apiKey } = useAuth();

  return (
    <>
      {apiKey ? <DashboardPage /> : <LoginPage />}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#334155',
            color: '#ffffff',
          },
        }}
      />
    </>
  );
}

export default App;
