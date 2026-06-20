import { mount } from 'svelte';

import App from './App.svelte';

const target = document.querySelector('#app');
if (target === null) {
  throw new Error('Missing #app mount node.');
}

const app = mount(App, { target });

export default app;
