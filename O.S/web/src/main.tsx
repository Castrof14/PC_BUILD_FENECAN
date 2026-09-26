import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Elemento #root nao encontrado em index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
