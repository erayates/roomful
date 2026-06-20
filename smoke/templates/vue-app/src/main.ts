import { createApp } from 'vue';

import App from './App.vue';
import { FlockPlugin } from '@flockjs/vue';

createApp(App)
  .use(FlockPlugin, {
    presence: {
      color: '#42b883',
      name: 'Vue Smoke',
    },
    roomId: 'publish-smoke-vue',
  })
  .mount('#app');
