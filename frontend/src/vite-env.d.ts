/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WISP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
