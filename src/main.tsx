import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './lib/theme';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/app.css';
import './styles/open-canvas.css';
import './styles/direction.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
