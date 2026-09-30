/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_SHORT_NAME?: string;
  readonly VITE_APP_SUBTITLE?: string;
  readonly VITE_APP_ICON_URL?: string;
  readonly VITE_APP_FULL_LOGO_URL?: string;
  readonly VITE_APP_USE_LOGO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
