import type { EnvironmentProviders, Signal } from '@angular/core';
import { signal } from '@angular/core';
import type { Peer } from '@roomful/core';
import {
  injectConnectionStatus,
  injectPresence,
  injectSharedState,
  provideRoomful,
  type RoomfulProviderOptions,
} from '@roomful/angular';

type SmokePresence = {
  color: string;
  name: string;
};

const options = {
  presence: {
    color: '#dd0031',
    name: 'Angular Smoke',
  },
} satisfies RoomfulProviderOptions<SmokePresence>;

const providers: EnvironmentProviders = provideRoomful('publish-smoke-angular', options);
const peers: Signal<Peer<SmokePresence>[]> = signal([]);

const summary = {
  helpers: [injectConnectionStatus, injectPresence, injectSharedState].every((helper) => {
    return typeof helper === 'function';
  }),
  peers: peers().length,
  providers: typeof providers === 'object',
};

const appElement = document.querySelector('#app');
if (appElement !== null) {
  appElement.textContent = JSON.stringify(summary, null, 2);
}
