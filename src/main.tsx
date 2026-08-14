import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { registerDict } from './lib/i18n.ts';
import { nl } from './i18n/nl.ts';
import './index.css';

// Language dictionaries register once, before first render. Adding a language:
// create src/i18n/<lang>.ts, add it to LANGS in lib/i18n.ts, register it here.
registerDict('nl', nl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
