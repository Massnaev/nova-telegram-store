import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AdminApp from './AdminApp.jsx';
import './styles.css';

const isAdmin = window.location.hash === '#admin' || new URLSearchParams(window.location.search).has('admin');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
