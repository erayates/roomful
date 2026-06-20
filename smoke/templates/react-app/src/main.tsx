import { createRoot } from 'react-dom/client';

import { App } from './App';

const rootElement = document.querySelector('#app');
if (rootElement === null) {
  throw new DOMException('Missing #app mount node.');
}

createRoot(rootElement).render(<App />);
