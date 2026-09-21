import type { CatalogEvent, RawCatalogEvent } from './types'

/** Nanoseconds per millisecond. */
const NS_PER_MS = 1_000_000

/**
 * The magnitude an analyst sets to say they could not get one.
 *
 * These arrive as `magnitudeType: "human"` - a magnitude somebody typed in
 * rather than measured - and -9.99 is how "no magnitude available" is flagged
 * in that field. Left alone it renders as "-9.99" and sorts below every
 * genuine event, which is worse than admitting there is none.
 *
 * NOTE the same dump had 212 human magnitudes of exactly 0. Zero is NOT
 * treated as a sentinel: an analyst can legitimately type it, and guessing
 * would hide a real assignment.
 */
const NO_MAGNITUDE = -9.99

/**
 * Whether the row carries a real location.
 *
 * Unlocated events arrive with latitude, longitude AND depth all exactly
 * zero. All three, always together - in the September dump no row had one
 * zero without the others - which is what makes this safe to key on rather
 * than a coincidence about an event genuinely near the prime meridian. Utah
 * is not at (0, 0) in any case.
 */
function hasRealLocation(raw: RawCatalogEvent): boolean {
  return !(raw.latitude === 0 && raw.longitude === 0 && raw.depth === 0)
}

/**
 * Converts a stored longitude to the signed form every map library expects.
 *
 * The catalog stores degrees east in 0-360 - deliberately, it is correct at
 * the source - so Utah arrives as ~247 rather than ~-113. Anything at or past
 * 180 wraps into the western hemisphere.
 */
export function toSignedLongitude(degreesEast: number): number {
  const wrapped = ((degreesEast % 360) + 360) % 360
  return wrapped > 180 ? wrapped - 360 : wrapped
}

export function parseCatalogEvent(raw: RawCatalogEvent): CatalogEvent {
  const timeMs = raw.originTime / NS_PER_MS
  const magnitude = raw.magnitude === NO_MAGNITUDE ? undefined : raw.magnitude
  return {
    id: raw.eventIdentifier,
    eventType: raw.eventType,
    version: raw.version,
    latitude: raw.latitude,
    longitude: toSignedLongitude(raw.longitude),
    depthKm: raw.depth / 1000,
    time: new Date(timeMs),
    timeMs,
    geographicType: raw.geographicType,
    reviewStatus: raw.reviewStatus,
    originSource: raw.originSource,
    hasLocation: hasRealLocation(raw),
    magnitude,
    // The type is meaningless without a value to attach it to. "human" is a
    // REAL type here - a magnitude the analyst typed in, with no observations
    // behind it - and shares its spelling with a review status by coincidence.
    magnitudeType: magnitude === undefined ? undefined : raw.magnitudeType,
    maximumAzimuthalGap: raw.maximumAzimuthalGap,
    weightedRootMeanSquaredError: raw.weightedRootMeanSquaredError,
    numberOfDefiningPhases: raw.numberOfDefiningPhases,
  }
}

export function parseCatalog(rows: RawCatalogEvent[]): CatalogEvent[] {
  return rows.map(parseCatalogEvent)
}
