import { createApp } from 'vue';

import App from './App.vue';
import { RoomfulPlugin } from '@roomful/vue';

createApp(App)
  .use(RoomfulPlugin, {
    presence: {
      color: '#42b883',
      name: 'Vue Smoke',
    },
    roomId: 'publish-smoke-vue',
  })
  .mount('#app');
