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
  /** Where the duty documentation lives. Always http(s), from the backend's config. */
  documentationURL?: string
}

export function fetchAppSettings(token: string | null, signal?: AbortSignal) {
  return apiGet<AppSettings>('/app-settings', token, signal)
}

/*
  One copy per session, whoever asks first.

  The event page reads these alongside the stations; the header now needs
  them too, for the documentation link, on every page. Keeping the cache here
  rather than inside the stations hook lets the header have the settings
  without also downloading the station list on the event list, where nothing
  uses it.
*/
let cache: AppSettings | null = null
let pending: Promise<AppSettings> | null = null

export function cachedAppSettings(): AppSettings | null {
  return cache
}

/** The settings, fetched at most once however many callers ask at once. */
export function loadAppSettings(token: string | null): Promise<AppSettings> {
  if (cache !== null) return Promise.resolve(cache)
  if (pending === null) {
    // No abort signal: the fetch is shared, so one caller unmounting must not
    // cancel it for the others.
    pending = fetchAppSettings(token)
      .then((settings) => {
        cache = settings
        return settings
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}
