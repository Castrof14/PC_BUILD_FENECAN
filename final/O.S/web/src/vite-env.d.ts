/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereco da API local da O.S. (O.S/.env). */
  readonly VITE_OS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
