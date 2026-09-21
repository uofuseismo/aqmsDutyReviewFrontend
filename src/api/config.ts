/**
 * Where the API lives, relative to wherever the app is served from.
 *
 * In production the browser only ever talks to one origin
 * (https://drp.apps.quake-utah.org). nginx is what forwards this prefix on
 * to the backend, and the TLS termination and re-establishment against the
 * Kubernetes ingress' self-signed certificate happen entirely between
 * proxies - the browser never sees that hop, so no CORS is involved and
 * nothing here has to know about it.
 *
 * In development, Vite's proxy stands in for that nginx hop; see
 * vite.config.ts.
 *
 * Override with VITE_API_BASE_URL if nginx exposes the backend under a
 * different prefix, or point it at an absolute URL to develop against a
 * remote backend (which would then need CORS).
 */
const raw = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Normalized without a trailing slash so joining is unambiguous. */
export const API_BASE_URL = raw.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Long enough to ride out a slow proxy hop, short enough to not look hung. */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * How often to re-fetch the catalog, in seconds.
 *
 * Deliberately slow by default. The backend computes the catalog hash by
 * running the real query - there is no caching layer yet - so each poll costs
 * a full database round trip. Two minutes keeps that to 30 queries an hour
 * per open tab while still feeling live for a catalog that gains 30-50 events
 * a day.
 *
 * Raise VITE_CATALOG_POLL_SECONDS to back off further, or set it to 0 to turn
 * polling off entirely and rely on the Refresh button.
 */
/**
 * How often to re-fetch the event locks, in seconds.
 *
 * Still faster than the catalog, because freshness matters more here: a stale
 * catalog row is a cosmetic annoyance, a stale lock is two analysts editing
 * one event.
 *
 * A minute rather than the original thirty seconds, at bbaker's request - the
 * database is doing the work and halving the query rate costs a reviewer at
 * most another half-minute before someone else's lock shows up. Most locks
 * match nothing in view anyway.
 *
 * `0` disables polling.
 */
export const LOCKS_POLL_SECONDS = (() => {
  const raw = Number(import.meta.env.VITE_LOCKS_POLL_SECONDS ?? '60')
  if (!Number.isFinite(raw) || raw < 0) return 60
  return raw === 0 ? 0 : Math.max(10, raw)
})()

export const CATALOG_POLL_SECONDS = (() => {
  const raw = Number(import.meta.env.VITE_CATALOG_POLL_SECONDS ?? '120')
  if (!Number.isFinite(raw) || raw < 0) return 120
  // Anything under 15s would hammer an uncached backend; treat it as a typo.
  return raw === 0 ? 0 : Math.max(15, raw)
})()

/**
 * How close a quarry has to be before it is drawn on the location map, in km.
 *
 * 15 km by default, from bbaker. Configurable because "near a quarry" is a
 * judgement about this network's geometry rather than a physical constant,
 * and the number that makes a blast plausible in the Wasatch Front may not be
 * the one that does on the Colorado Plateau.
 */
export const QUARRY_PROXIMITY_KM = (() => {
  const raw = Number(import.meta.env.VITE_QUARRY_PROXIMITY_KM ?? '15')
  if (!Number.isFinite(raw) || raw <= 0) return 15
  return raw
})()
