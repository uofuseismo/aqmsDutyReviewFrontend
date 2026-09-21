/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Path prefix (or absolute origin) the API is served under. Defaults to
   * "/api", which the dev proxy and the production nginx both forward to the
   * backend. See src/api/config.ts.
   */
  readonly VITE_API_BASE_URL?: string
  /**
   * Seconds between catalog polls. Default 120, minimum 15, `0` disables
   * polling. See src/api/config.ts.
   */
  readonly VITE_CATALOG_POLL_SECONDS?: string
  /**
   * Seconds between event-lock polls. Default 30, minimum 10, `0` disables.
   * Faster than the catalog on purpose - see src/api/config.ts.
   */
  readonly VITE_LOCKS_POLL_SECONDS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
