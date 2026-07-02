import './styles.css';

import { createRoot } from 'react-dom/client';

import { App } from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new TypeError('Missing #root element for the interop example.');
}

createRoot(rootElement).render(<App />);
