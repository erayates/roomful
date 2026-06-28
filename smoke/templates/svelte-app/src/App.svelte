<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const adapter = roomful<{ color: string; name: string }>('publish-smoke-svelte', {
    presence: {
      color: '#ff3e00',
      name: 'Svelte Smoke',
    },
  });

  const presence = adapter.presence;
  const awareness = adapter.awareness;
  const [sharedState, setSharedState] = adapter.state.shared('svelte-smoke-state', {
    initialValue: { count: 1 },
    strategy: 'lww',
  });

  setSharedState((current) => {
    return { ...current, count: current.count + 1 };
  });
</script>

<pre>{JSON.stringify({ peers: $presence.all.length, awareness: $awareness.others.length, count: $sharedState.count }, null, 2)}</pre>
