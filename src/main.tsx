import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { configureApp } from './app/configureApp';
import './app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz da aplicação não encontrado.');
const configuration = configureApp(import.meta.env);
createRoot(root).render(
  <StrictMode>
    <App configuration={configuration} />
  </StrictMode>,
);
