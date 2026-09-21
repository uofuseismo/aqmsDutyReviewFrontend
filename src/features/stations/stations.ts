import { apiGet } from '../../api/client'
import { toSignedLongitude } from '../events/parseCatalog'

/**
 * A station epoch from /stations.
 *
 * The response calls these "station epochs", so one station can in principle
 * appear more than once with different date ranges - a move, a re-siting, an
 * instrument swap. The sample seen so far happens to hold exactly one epoch
 * per station, but the wording says not to count on that.
 */
export interface RawStation {
  network: string
  name: string
  latitude: number
  /** Degrees east, 0-360, as everywhere else in this API. */
  longitude: number
  /** SECONDS since the epoch - not nanoseconds like the catalog. */
  onDate: number
  offDate: number
}

export interface Station {
  /** "UU.FORK3" - unique across networks, unlike the bare name. */
  key: string
  network: string
  name: string
  latitude: number
  /** Signed degrees east, -180..180. */
  longitude: number
  onDate: Date
  offDate: Date
  /** Whether this epoch covers the present moment. */
  isActive: boolean
  /**
   * Whether the epoch has no real end date - the offDate is one of the
   * far-future sentinels rather than a decommissioning. Lets a tooltip say
   * "since 2011" instead of "2011 - 3000".
   */
  isOpenEnded: boolean
}

export function stationKey(network: string, name: string): string {
  return `${network}.${name}`
}

/**
 * An offDate this far out means "still running" rather than a real end.
 *
 * There is more than one such sentinel in the data - 4070908800 (2099) and
 * 32503680000 (3000) both appear - so this is a range test rather than a
 * comparison against a magic number. Any future date works the same way for
 * the only question asked: is this epoch current?
 */
const FAR_FUTURE_SECONDS = 4_000_000_000 // ~2096

export function parseStations(rows: RawStation[], now: Date = new Date()): Station[] {
  const nowSeconds = now.getTime() / 1000
  const parsed = rows.map((row): Station => ({
    key: stationKey(row.network, row.name),
    network: row.network,
    name: row.name,
    latitude: row.latitude,
    longitude: toSignedLongitude(row.longitude),
    // Seconds, not nanoseconds. Third time convention in this API.
    onDate: new Date(row.onDate * 1000),
    offDate: new Date(row.offDate * 1000),
    isActive: row.onDate <= nowSeconds && row.offDate >= nowSeconds,
    isOpenEnded: row.offDate >= FAR_FUTURE_SECONDS,
  }))

  return parsed
}

/**
 * Every epoch a station has, keyed by network.station and oldest first.
 *
 * All of them are kept, not just the current one: placing an observation from
 * 2019 needs where the instrument was in 2019, and a station that has moved
 * has an epoch for each position.
 */
export function indexStationEpochs(stations: Station[]): Map<string, Station[]> {
  const byKey = new Map<string, Station[]>()
  for (const station of stations) {
    const existing = byKey.get(station.key)
    if (existing) existing.push(station)
    else byKey.set(station.key, [station])
  }
  for (const epochs of byKey.values()) {
    epochs.sort((a, b) => a.onDate.getTime() - b.onDate.getTime())
  }
  return byKey
}

/**
 * The epoch to use for an observation at a given instant.
 *
 * Prefer the one whose span contains the time. Failing that, take the epoch
 * whose start or end sits closest to it - a station that was decommissioned a
 * month after an event, or installed a month before one, has not moved
 * appreciably, and an approximate position beats no position at all.
 *
 * Returns undefined only when the station is unknown entirely.
 */
export function selectEpochAt(epochs: Station[] | undefined, at: Date): Station | undefined {
  if (epochs === undefined || epochs.length === 0) return undefined
  const t = at.getTime()

  const covering = epochs.find(
    (epoch) => epoch.onDate.getTime() <= t && t <= epoch.offDate.getTime(),
  )
  if (covering !== undefined) return covering

  let nearest = epochs[0]
  let nearestGap = Number.POSITIVE_INFINITY
  for (const epoch of epochs) {
    const gap = Math.min(
      Math.abs(epoch.onDate.getTime() - t),
      Math.abs(epoch.offDate.getTime() - t),
    )
    if (gap < nearestGap) {
      nearestGap = gap
      nearest = epoch
    }
  }
  return nearest
}

/**
 * One epoch per station, for drawing dots on a map.
 *
 * A map wants one marker per instrument; two markers a few metres apart for
 * the same station is noise. Prefers a currently-running epoch, else the most
 * recent.
 */
export function indexStations(stations: Station[]): Map<string, Station> {
  const best = new Map<string, Station>()
  for (const station of stations) {
    const existing = best.get(station.key)
    if (
      existing === undefined ||
      (station.isActive && !existing.isActive) ||
      (station.isActive === existing.isActive &&
        station.onDate.getTime() > existing.onDate.getTime())
    ) {
      best.set(station.key, station)
    }
  }
  return best
}

export function fetchStations(token: string | null, signal?: AbortSignal) {
  return apiGet<RawStation[]>('/stations', token, signal)
}
