/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Browser-facing Forgejo URL. Build-time, because it is baked into links. */
  readonly VITE_FORGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
