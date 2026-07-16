import { render } from 'solid-js/web';

import { App } from './App';

const rootElement = document.querySelector('#app');
if (rootElement === null) {
  throw new DOMException('Missing #app mount node.');
}

render(() => <App />, rootElement);
