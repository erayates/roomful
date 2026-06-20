import { createApp } from 'vue';

import App from './App.vue';
import { CahootsPlugin } from '@cahoots/vue';

createApp(App)
  .use(CahootsPlugin, {
    presence: {
      color: '#42b883',
      name: 'Vue Smoke',
    },
    roomId: 'publish-smoke-vue',
  })
  .mount('#app');
