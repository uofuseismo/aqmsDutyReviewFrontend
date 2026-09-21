/**
 * Reporting regions, as latitude/longitude rings.
 *
 * Coordinates are [latitude, longitude] with signed longitude - already the
 * order Leaflet wants, so nothing is converted on the way to the map. Note
 * this differs from the API, which quotes longitude 0-360.
 *
 * The rings are closed (first point repeated last). Leaflet closes a polygon
 * itself, so the repeat is harmless, and it is kept because that is how these
 * are written down elsewhere.
 */
export type Ring = Array<Array<number>>

const UTAH: Ring = [
  [36.75, -114.25],
  [36.75, -108.75],
  [42.5, -108.75],
  [42.5, -114.25],
  [36.75, -114.25],
]

const YELLOWSTONE: Ring = [
  [44.0, -111.333],
  [44.0, -109.75],
  [45.167, -109.75],
  [45.167, -111.333],
  [44.0, -111.333],
]

const REPORTING: Ring = [
  [35, -115.25],
  [35, -107.75],
  [46, -107.75],
  [46, -115.25],
  [35, -115.25],
]

const FORGE: Ring = [
  [38.50766251464152, -112.9172670480094],
  [38.50765095807106, -112.8984475721061],
  [38.48464129404871, -112.8986038105227],
  [38.48473681463327, -112.889197233939],
  [38.50007663264921, -112.8891782562262],
  [38.50006934569299, -112.8800311838714],
  [38.51489823672957, -112.8801413665903],
  [38.51492363342575, -112.9169998098031],
  [38.50766251464152, -112.9172670480094],
]

export function getUtahRegion(): Ring {
  return UTAH
}
export function getYellowstoneRegion(): Ring {
  return YELLOWSTONE
}
export function getReportingRegion(): Ring {
  return REPORTING
}
export function getFORGERegion(): Ring {
  return FORGE
}

export interface Region {
  id: string
  name: string
  ring: Ring
  /**
   * Roughly how big the region is, north to south, in km.
   *
   * These span three orders of magnitude - FORGE is 3 km across, the
   * reporting boundary 1200 - which is why only some are worth drawing.
   */
  spanKm: number
  /**
   * Whether to outline this region on the event map.
   *
   * The reporting boundary is excluded: it contains every event in the
   * catalog, so an outline of it can never tell a reader anything, and at
   * the zoom a local event fits into it is off screen anyway. It stays in
   * the containment test, where "inside the reporting boundary but outside
   * Utah" is a real answer for the 31 events in that band.
   */
  drawOnMap: boolean
}

/**
 * Ordered largest to smallest, which is also the order they must be drawn:
 * a later polygon paints over an earlier one, and FORGE sits inside Utah
 * which sits inside the reporting boundary.
 */
export const REGIONS: Region[] = [
  // No per-region colour: they are all drawn the same thin line. Colouring
  // them differently implied a meaning the regions do not carry.
  { id: 'reporting', name: 'Reporting boundary', ring: REPORTING, spanKm: 1223, drawOnMap: false },
  { id: 'utah', name: 'Utah', ring: UTAH, spanKm: 639, drawOnMap: true },
  { id: 'yellowstone', name: 'Yellowstone', ring: YELLOWSTONE, spanKm: 130, drawOnMap: true },
  { id: 'forge', name: 'FORGE', ring: FORGE, spanKm: 3.4, drawOnMap: true },
]

/** The regions actually outlined on the map. */
export const DRAWN_REGIONS = REGIONS.filter((region) => region.drawOnMap)

/** The network's outer limit, as opposed to a place with a name. */
export const REPORTING_REGION_ID = 'reporting'

export interface RegionSummary {
  /** What to show. */
  label: string
  /** True when this is a warning rather than a location. */
  outside: boolean
  /** The long form, for a tooltip. */
  detail: string
}

/**
 * One tag, saying where the event is.
 *
 * The containing regions nest - FORGE is inside Utah is inside the reporting
 * boundary - so listing all of them spent a row to say the same thing three
 * times. Only the SMALLEST named one carries information: "FORGE" already
 * implies Utah.
 *
 * The reporting boundary is deliberately not a place: being inside it is the
 * normal case and says nothing, so it earns a tag only when the event is
 * OUTSIDE it, which is the one state worth interrupting for - something has
 * been located beyond where this network should be locating things.
 */
export function summariseRegions(latitude: number, longitude: number): RegionSummary {
  const containing = regionsContaining(latitude, longitude)
  const named = containing.filter((region) => region.id !== REPORTING_REGION_ID)
  if (named.length > 0) {
    return {
      label: named[0].name,
      outside: false,
      detail:
        named.length === 1
          ? `Inside ${named[0].name}`
          : `Inside ${named.map((region) => region.name).join(', inside ')}`,
    }
  }
  if (containing.length > 0) {
    return {
      label: 'Reporting area',
      outside: false,
      detail: 'Inside the reporting boundary, but not in a named region',
    }
  }
  return {
    label: 'Outside reporting area',
    outside: true,
    detail: 'Outside the reporting boundary - beyond where this network reports events',
  }
}

/**
 * Whether a point falls inside a ring, by ray casting.
 *
 * Points are compared in the ring's own [lat, lon] order. Good enough at
 * these sizes: the rings are small relative to the globe and none crosses the
 * antimeridian, so treating latitude and longitude as a plane costs nothing a
 * duty screen would notice.
 *
 * A point exactly on an edge is not guaranteed either way, which is inherent
 * to the method and immaterial here - an epicentre lands on a boundary about
 * as often as never.
 */
export function isInsideRing(latitude: number, longitude: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i]
    const [latJ, lonJ] = ring[j]
    const straddles = latI > latitude !== latJ > latitude
    if (straddles && longitude < ((lonJ - lonI) * (latitude - latI)) / (latJ - latI) + lonI) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Which regions contain a point, smallest first.
 *
 * Smallest first because that is the informative one: everything in the
 * catalog is inside the reporting boundary, so "Reporting" alone says
 * nothing, while "FORGE" says this is the geothermal sequence.
 */
export function regionsContaining(latitude: number, longitude: number): Region[] {
  return REGIONS.filter((region) => isInsideRing(latitude, longitude, region.ring))
    .slice()
    .sort((a, b) => a.spanKm - b.spanKm)
}
