/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" = modo demo: salta el login y muestra las vistas mock sin backend. */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
