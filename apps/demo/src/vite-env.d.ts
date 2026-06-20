/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_BASE_URL?: string;
  readonly VITE_ROOMFUL_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
