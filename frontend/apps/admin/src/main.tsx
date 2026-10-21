import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
// @hub/ui primero: sus tokens.css deben cargarse ANTES de styles/panel.css (importado por App)
import '@hub/ui';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
