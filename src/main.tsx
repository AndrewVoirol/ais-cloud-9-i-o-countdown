import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept and hide benign React HMR & Three.js Deprecation warnings from the console.
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('createRoot()')) return;
  originalError(...args);
};

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock')) return;
  originalWarn(...args);
};

const rootElement = document.getElementById('root')!;

if (!(window as any)._reactRoot) {
  (window as any)._reactRoot = createRoot(rootElement);
}

(window as any)._reactRoot.render(
  <StrictMode>
    <App />
  </StrictMode>
);

