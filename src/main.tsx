import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import '@/i18n';
import '@fontsource-variable/rubik';
import '@fontsource-variable/geist-mono';
import rubikWoff2 from '@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2?url';
import '@/index.css';

// Preload the primary face (fontsource CSS is font-display: swap already).
const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = rubikWoff2;
document.head.appendChild(preload);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
