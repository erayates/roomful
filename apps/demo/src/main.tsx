import './styles.css';

import { createRoot } from 'react-dom/client';

import { App } from './app';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new TypeError('Missing #root element for the Cahoots demo app.');
}

createRoot(rootElement).render(<App />);
