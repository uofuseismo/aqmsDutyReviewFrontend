import { computeGeometry } from '../events/reconcileGeometry'
import { toSignedLongitude } from '../events/parseCatalog'

/**
 * A quarry, as /gazetteer/quarries sends it.
 *
 * `onDate`/`offDate` are epoch SECONDS, the same convention the station
 * epochs use. In the September 2026 dump every one of the 494 rows carries
 * the same pair - opened 2022-01-01, closing in the year 3000 - so they say
 * nothing yet, but the schema has them and a closed quarry would.
 */
export interface RawQuarry {
  name: string
  latitude: number
  /** Degrees east in 0-360, as with everything else from this backend. */
  longitude: number
  onDate: number
  offDate: number
}

export interface Quarry {
  name: string
  latitude: number
  /** Signed degrees east, converted from the stored 0-360. */
  longitude: number
  onDate: Date
  offDate: Date
}

export function parseQuarries(rows: RawQuarry[] | null | undefined): Quarry[] {
  return (rows ?? [])
    .filter((row) => typeof row.latitude === 'number' && typeof row.longitude === 'number')
    .map((row) => ({
      name: row.name,
      latitude: row.latitude,
      longitude: toSignedLongitude(row.longitude),
      onDate: new Date(row.onDate * 1000),
      offDate: new Date(row.offDate * 1000),
    }))
}

export interface NearbyQuarry extends Quarry {
  /** Great-circle distance from the origin, in km. */
  distanceKm: number
}

/**
 * The quarries within `radiusKm` of a point, nearest first.
 *
 * Why this exists: an event a few kilometres from a working quarry is quite
 * possibly a blast, and that changes what a reviewer is looking at before
 * they read a single residual. The catalog has a `quarry_blast` event type,
 * but only once somebody has decided that - this is the evidence for deciding.
 *
 * A cheap latitude window runs first. 494 geodesics is not slow, but this
 * runs on every origin change and most quarries are hundreds of km away; one
 * subtraction rejects them. A degree of latitude is about 111 km everywhere,
 * so the window is honest in the only direction where it has to be.
 */
export function quarriesWithin(
  origin: { latitude: number; longitude: number },
  quarries: Quarry[],
  radiusKm: number,
): NearbyQuarry[] {
  const latitudeWindow = radiusKm / 111 + 0.01
  const near: NearbyQuarry[] = []
  for (const quarry of quarries) {
    if (Math.abs(quarry.latitude - origin.latitude) > latitudeWindow) continue
    const { distanceKm } = computeGeometry(origin, quarry)
    if (distanceKm <= radiusKm) near.push({ ...quarry, distanceKm })
  }
  return near.sort((a, b) => a.distanceKm - b.distanceKm)
}
