/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_BASE_URL?: string;
  readonly VITE_CAHOOTS_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
