import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './AdminApp.jsx';
import './styles.css';

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const isAdmin = hash === '#admin' || new URLSearchParams(window.location.search).has('admin');

  return (
    <React.StrictMode>
      {isAdmin ? (
        <AdminApp onGoToStore={() => { window.location.hash = ''; }} />
      ) : (
        <App onGoToAdmin={() => { window.location.hash = '#admin'; }} />
      )}
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);

