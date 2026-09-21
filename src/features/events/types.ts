/**
 * The catalog as the backend sends it: /events returns
 * {"message": "Found N event(s)", "data": [...]}, newest first, one row per
 * event.
 *
 * The optional ones are genuinely absent - the key is missing, not null - so
 * they are `?:` rather than `| null`.
 *
 * These were originally checked against a 673-event dump in which every row
 * happened to carry a geographicType. A later 1768-event dump had 93 without
 * one, and since the type promised a string, `humanize` called `.replace` on
 * undefined and took down the whole list. A field is optional because the
 * BACKEND may omit it, not because a sample happened not to.
 */
export interface RawCatalogEvent {
  eventIdentifier: number
  eventType: string
  version: number
  latitude: number
  /** Degrees east in 0-360. Utah reads ~245-250. */
  longitude: number
  /** Metres. Negative above sea level, which is ordinary in Utah. */
  depth: number
  /**
   * Nanoseconds since the epoch.
   *
   * This exceeds Number.MAX_SAFE_INTEGER by ~199x, so JSON.parse has already
   * rounded it (to roughly the nearest 256 ns) before we ever see it. Fine
   * for display and ordering; it must never be sent back as an identity.
   */
  originTime: number
  /** Absent on events with no location yet - see CatalogEvent.hasLocation. */
  geographicType?: string
  reviewStatus: string
  originSource: string
  maximumAzimuthalGap?: number
  weightedRootMeanSquaredError?: number
  numberOfDefiningPhases?: number
  magnitude?: number
  magnitudeType?: string
}

/**
 * The `data` payload of /events.
 *
 * The hash and the events arrive together, so the hash is by construction a
 * description of the events in the same response. That is all the client
 * needs: it never has to reason about the two drifting apart on the server,
 * only about whether this response's hash differs from the last one it kept.
 */
export interface RawCatalogPayload {
  /** SHA-256 hex of the catalog contents; the baseline for change detection. */
  hash: string
  events: RawCatalogEvent[]
}

export interface CatalogResponse {
  message: string
  data: RawCatalogPayload
}

/**
 * Review states seen in the wild, most-to-least raw. A dump taken before an
 * analyst had touched anything showed only two of these, which is the reason
 * `ReviewStatus` stays open to strings: the sample is not the schema.
 */
export const REVIEW_STATUSES = [
  'automatic',
  'incomplete',
  'human',
  'finalized',
] as const

export type KnownReviewStatus = (typeof REVIEW_STATUSES)[number]
// `string & {}` keeps editor completion for the known values while still
// accepting a status this build has never heard of.
export type ReviewStatus = KnownReviewStatus | (string & {})

export function isKnownReviewStatus(value: string): value is KnownReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(value)
}

/**
 * An event in the units and conventions this app works in, as opposed to the
 * ones the database happens to store.
 */
export interface CatalogEvent {
  id: number
  eventType: string
  version: number
  latitude: number
  /** Signed degrees east, -180..180, converted from the stored 0-360. */
  longitude: number
  /** Kilometres, converted from the stored metres. */
  depthKm: number
  /** Origin time as a JS Date (UTC; seismology does not work in local time). */
  time: Date
  /** Milliseconds since epoch - what sorting and comparison use. */
  timeMs: number
  geographicType?: string
  /**
   * False when the event has no location yet.
   *
   * The backend sends latitude, longitude and depth all as exactly zero for
   * these - 330 of 1768 rows in the September dump, every one of them zero in
   * all three, none in either hemisphere alone. Plotting that literally puts
   * Utah events in the Gulf of Guinea, so the coordinates are withheld rather
   * than drawn. The row stays: an unlocated incomplete event is precisely
   * what a duty analyst needs to see.
   */
  hasLocation: boolean
  reviewStatus: ReviewStatus
  originSource: string
  magnitude?: number
  /** Raw type string, e.g. "local". See `magnitudeLabel` for "Ml". */
  magnitudeType?: string
  maximumAzimuthalGap?: number
  weightedRootMeanSquaredError?: number
  numberOfDefiningPhases?: number
}
