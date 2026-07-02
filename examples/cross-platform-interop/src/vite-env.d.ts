/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROOMFUL_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
