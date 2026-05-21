import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Toaster } from './components/Toaster';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmRoot } from './components/ConfirmRoot';
import { UpdateBanner } from './components/UpdateBanner';
import { GlobalHelp } from './components/GlobalHelp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <UpdateBanner />
      <Toaster />
      <ConfirmRoot />
      <GlobalHelp />
    </ErrorBoundary>
  </React.StrictMode>
);
