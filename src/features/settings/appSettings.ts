import { apiGet } from '../../api/client'

/**
 * What /app-settings hands back. Fetched once and kept - none of it changes
 * while the app is open.
 *
 * The route requires a token: it carries the Stadia Maps key.
 */
export interface AppSettings {
  backendVersion?: string
  stadiaMapKey?: string
  primaryDatabase?: string
}

export function fetchAppSettings(token: string | null, signal?: AbortSignal) {
  return apiGet<AppSettings>('/app-settings', token, signal)
}
