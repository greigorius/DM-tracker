import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import './index.css';
import App from './App.jsx';
import { queryClient, persistOptions } from './lib/queryClient.js';
import { ToastProvider } from './components/ui/index.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
