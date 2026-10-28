import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from '@/renderer/App';
import { loadTheme, platformTheme } from '@/renderer/theme';

// Loaded before the first render, so the window is drawn in its theme from the start.
const theme = await loadTheme(platformTheme(window.electronAPI.platform));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App theme={theme} />
  </StrictMode>,
);
