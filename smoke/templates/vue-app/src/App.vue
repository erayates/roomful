<script setup lang="ts">
import { useAwareness, usePresence, useSharedState } from '@cahoots/vue';

type SmokePresence = {
  color: string;
  name: string;
};

const presence = usePresence<SmokePresence>();
const awareness = useAwareness();
const [sharedState] = useSharedState('vue-smoke-state', {
  initialValue: { count: 1 },
  strategy: 'lww',
});
</script>

<template>
  <pre>
    {{
      JSON.stringify(
        {
          awareness: awareness.others.value.length,
          count: sharedState.count,
          peers: presence.all.value.length,
        },
        null,
        2,
      )
    }}
  </pre>
</template>
