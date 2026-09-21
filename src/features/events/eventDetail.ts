import { toSignedLongitude } from './parseCatalog'

/** Nanoseconds per millisecond / per second. */
const NS_PER_MS = 1_000_000
const NS_PER_S = 1_000_000_000

/* ---------- the payload, as /events/<evid> sends it ---------- */

export interface RawArrival {
  arrivalIdentifier: number
  network: string
  station: string
  channel: string
  locationCode: string
  /** Nanoseconds since the epoch. */
  arrivalTime: number
  phase: string
  reviewStatus: string
  /** Pick weight, 0-1. */
  quality: number
  /**
   * Traveltime residual in NANOSECONDS, like every other time here.
   *
   * Worth stating because the raw values look alarming: -10000000 reads like
   * a no-value sentinel until you divide by 1e9 and get -0.01 s. They track
   * distance and pick quality exactly as residuals should.
   */
  residual: number
  /**
   * Epicentral distance in METRES, or absent.
   *
   * Absent or null is ordinary, not exceptional: plenty of observations
   * arrive with no geometry at all, and it is filled in locally from the
   * station list. See reconcileGeometry.
   *
   * The unit was kilometres in the 2026-09-03 sample and metres in the
   * 2026-09-07 one - confirmed by apparent P velocity, which only lands in
   * the 3-8 km/s band under one reading per file. Metres matches `depth`.
   * Not auto-detected by magnitude: guessing a unit from how big the number
   * happens to be is how the user-store timestamps went wrong.
   */
  sourceReceiverDistance?: number | null
  /** Degrees clockwise from north, 0-360. Not radians. May be absent. */
  sourceReceiverAzimuth?: number | null
}

/** One station's contribution to a network magnitude. */
export interface RawStationMagnitude {
  network: string
  station: string
  channel: string
  locationCode: string
  /** Nanoseconds since the epoch - the start of the measured window. */
  startTime?: number
  /** This station's own magnitude estimate. */
  magnitude: number
  /** Coda length in seconds, for a duration magnitude. */
  duration?: number
  reviewStatus?: string
  /** Weight this station carried in the network average. */
  weight?: number
  /** Metres, or absent - same story as an arrival's. */
  sourceReceiverDistance?: number | null
  sourceReceiverAzimuth?: number | null
  /**
   * Station magnitude MINUS the network magnitude, in MAGNITUDE UNITS.
   *
   * Nothing like an arrival residual, which is a time in nanoseconds. Checked
   * against the data: every station's residual equals its own magnitude less
   * the network value, exactly.
   */
  residual?: number
  /** Station correction, magnitude units. */
  correction?: number
}

export interface RawMagnitude {
  magnitudeIdentifier: number
  magnitudeType?: string
  magnitude?: number
  reviewStatus?: string
  stationMagnitudes?: RawStationMagnitude[]
}

/**
 * Magnitudes arrive keyed by kind - `durationMagnitude`, `localMagnitude` -
 * rather than as an array. An earlier sample used an array, and the shape is
 * still moving, so both are accepted.
 */
export type RawMagnitudes = Record<string, RawMagnitude> | RawMagnitude[]

export interface RawOrigin {
  originIdentifier: number
  isPreferred?: boolean
  latitude: number
  /** Degrees east, 0-360, as everywhere else in this API. */
  longitude: number
  /** Metres. */
  depth: number
  originTime: number
  geographicType?: string
  reviewStatus?: string
  preferredMagnitudeIdentifier?: number
  magnitudes?: RawMagnitudes
  /**
   * Solution quality, added to the origin payload on 2026-09-11.
   *
   * Deliberately NOT lifted from the catalog row, which carries one set of
   * numbers per EVENT - whichever origin was preferred when it was built. On
   * a multi-origin event that would attach the preferred origin's quality to
   * every origin: 31151981's two origins differ (gap 140 vs 161, wRMSE 0.01
   * vs 0.02, 8 defining phases vs 6), so the wrong numbers would have looked
   * entirely plausible next to the right ones.
   *
   * Same names as the catalog's, because they are the same quantities.
   */
  maximumAzimuthalGap?: number
  weightedRootMeanSquaredError?: number
  numberOfDefiningPhases?: number
  /** Reported count, which need not match `arrivals.length`. */
  arrivalCount?: number
  arrivals?: RawArrival[]
}

export interface RawEventDetail {
  eventIdentifier: number
  eventType?: string
  version?: number
  preferredOriginIdentifier?: number
  preferredMagnitudeIdentifier?: number
  origins?: RawOrigin[]
}

/* ---------- the shapes this app works in ---------- */

export interface Arrival {
  id: number
  /**
   * "UU.FORK3.GHZ.01" - network, station, channel, location.
   *
   * Note this puts channel before location, which inverts the last two
   * fields of the SEED/FDSN convention (NET.STA.LOC.CHA). Deliberate: it is
   * the order asked for, and the channel is the more useful of the two to
   * read at a glance.
   */
  streamId: string
  network: string
  station: string
  channel: string
  locationCode: string
  time: Date
  timeMs: number
  phase: string
  reviewStatus: string
  quality: number
  /** Seconds, converted from the stored nanoseconds. */
  residualSeconds: number
  /** Undefined when the payload had none and no station could supply it. */
  distanceKm?: number
  azimuthDegrees?: number
  /**
   * Where the geometry came from.
   *
   *  - `reported`  the payload carried it
   *  - `computed`  derived here from the origin and the station's position
   *  - `unknown`   the payload had none and the station is not in the list
   *
   * Worth carrying rather than inferring: a reviewer comparing a distance
   * against another tool should be able to find out whether the number came
   * from the database or from this app.
   */
  geometrySource: 'reported' | 'computed' | 'unknown'
  /** Seconds from origin time to this pick. */
  travelTimeSeconds: number
}

export interface StationMagnitude {
  /** "UU.FOR5.HHZ.01" - network, station, channel, location. */
  streamId: string
  network: string
  station: string
  channel: string
  locationCode: string
  startTime: Date | null
  magnitude: number
  /** Coda length in seconds; absent for magnitude types without one. */
  durationSeconds?: number
  /** Station minus network, in magnitude units. */
  residual?: number
  correction?: number
  reviewStatus?: string
  weight?: number
  /** Undefined when the payload had none and no station could supply it. */
  distanceKm?: number
  azimuthDegrees?: number
  /** Where the geometry came from - see Arrival.geometrySource. */
  geometrySource: 'reported' | 'computed' | 'unknown'
}

export interface Magnitude {
  id: number
  /** The payload key it arrived under, e.g. "durationMagnitude". */
  kind?: string
  type?: string
  value?: number
  reviewStatus?: string
  isPreferred: boolean
  stationMagnitudes: StationMagnitude[]
}

export interface Origin {
  id: number
  isPreferred: boolean
  latitude: number
  /** Signed degrees east, -180..180. */
  longitude: number
  depthKm: number
  time: Date
  timeMs: number
  geographicType?: string
  reviewStatus?: string
  /** Degrees; the largest azimuthal hole in the station coverage. */
  maximumAzimuthalGap?: number
  /** Seconds. */
  weightedRootMeanSquaredError?: number
  numberOfDefiningPhases?: number
  magnitudes: Magnitude[]
  arrivals: Arrival[]
}

export interface EventDetail {
  id: number
  eventType?: string
  version?: number
  preferredOriginId?: number
  preferredMagnitudeId?: number
  origins: Origin[]
  /** The preferred origin, or the first one, or undefined if there are none. */
  preferredOrigin?: Origin
}

function parseArrival(raw: RawArrival, originTimeNs: number): Arrival {
  const timeMs = raw.arrivalTime / NS_PER_MS
  const reportedDistance =
    typeof raw.sourceReceiverDistance === 'number' ? raw.sourceReceiverDistance : undefined
  const reportedAzimuth =
    typeof raw.sourceReceiverAzimuth === 'number' ? raw.sourceReceiverAzimuth : undefined
  // Both or neither: half a geometry is not useful, and a payload carrying
  // one without the other has not been seen.
  const hasGeometry = reportedDistance !== undefined && reportedAzimuth !== undefined
  return {
    id: raw.arrivalIdentifier,
    streamId: [raw.network, raw.station, raw.channel, raw.locationCode]
      .filter((part) => part !== undefined && part !== '')
      .join('.'),
    network: raw.network,
    station: raw.station,
    channel: raw.channel,
    locationCode: raw.locationCode,
    time: new Date(timeMs),
    timeMs,
    phase: raw.phase,
    reviewStatus: raw.reviewStatus,
    quality: raw.quality,
    residualSeconds: raw.residual / NS_PER_S,
    distanceKm: hasGeometry ? reportedDistance / 1000 : undefined,
    azimuthDegrees: hasGeometry ? reportedAzimuth : undefined,
    geometrySource: hasGeometry ? 'reported' : 'unknown',
    travelTimeSeconds: (raw.arrivalTime - originTimeNs) / NS_PER_S,
  }
}

/** Accepts either shape, so a change back or forward does not break this. */
function toMagnitudeEntries(
  magnitudes: RawMagnitudes | undefined,
): Array<[string | undefined, RawMagnitude]> {
  if (magnitudes === undefined) return []
  if (Array.isArray(magnitudes)) return magnitudes.map((m) => [undefined, m])
  return Object.entries(magnitudes).map(([kind, m]) => [kind, m])
}

function parseStationMagnitude(raw: RawStationMagnitude): StationMagnitude {
  const distance =
    typeof raw.sourceReceiverDistance === 'number' ? raw.sourceReceiverDistance : undefined
  const azimuth =
    typeof raw.sourceReceiverAzimuth === 'number' ? raw.sourceReceiverAzimuth : undefined
  const hasGeometry = distance !== undefined && azimuth !== undefined
  return {
    streamId: [raw.network, raw.station, raw.channel, raw.locationCode]
      .filter((part) => part !== undefined && part !== '')
      .join('.'),
    network: raw.network,
    station: raw.station,
    channel: raw.channel,
    locationCode: raw.locationCode,
    startTime:
      typeof raw.startTime === 'number' ? new Date(raw.startTime / NS_PER_MS) : null,
    magnitude: raw.magnitude,
    durationSeconds: raw.duration,
    residual: raw.residual,
    correction: raw.correction,
    reviewStatus: raw.reviewStatus,
    weight: raw.weight,
    distanceKm: hasGeometry ? distance / 1000 : undefined,
    azimuthDegrees: hasGeometry ? azimuth : undefined,
    geometrySource: hasGeometry ? 'reported' : 'unknown',
  }
}

export function parseEventDetail(raw: RawEventDetail): EventDetail {
  const origins = (raw.origins ?? []).map((origin): Origin => {
    const timeMs = origin.originTime / NS_PER_MS
    const preferredMagnitudeId = origin.preferredMagnitudeIdentifier
    return {
      id: origin.originIdentifier,
      // Trust the flag when present, fall back to the event-level pointer.
      isPreferred:
        origin.isPreferred ?? origin.originIdentifier === raw.preferredOriginIdentifier,
      latitude: origin.latitude,
      longitude: toSignedLongitude(origin.longitude),
      depthKm: origin.depth / 1000,
      time: new Date(timeMs),
      timeMs,
      geographicType: origin.geographicType,
      reviewStatus: origin.reviewStatus,
      maximumAzimuthalGap: origin.maximumAzimuthalGap,
      weightedRootMeanSquaredError: origin.weightedRootMeanSquaredError,
      numberOfDefiningPhases: origin.numberOfDefiningPhases,
      magnitudes: toMagnitudeEntries(origin.magnitudes).map(([kind, m]) => ({
        id: m.magnitudeIdentifier,
        kind,
        type: m.magnitudeType,
        value: m.magnitude,
        reviewStatus: m.reviewStatus,
        isPreferred: m.magnitudeIdentifier === preferredMagnitudeId,
        stationMagnitudes: (m.stationMagnitudes ?? []).map(parseStationMagnitude),
      })),
      arrivals: (origin.arrivals ?? []).map((a) => parseArrival(a, origin.originTime)),
    }
  })

  return {
    id: raw.eventIdentifier,
    eventType: raw.eventType,
    version: raw.version,
    preferredOriginId: raw.preferredOriginIdentifier,
    preferredMagnitudeId: raw.preferredMagnitudeIdentifier,
    origins,
    preferredOrigin: origins.find((o) => o.isPreferred) ?? origins[0],
  }
}

/**
 * How far a residual may sit from zero before it is worth pointing at.
 *
 * Phase-dependent because the two are not comparable: an S arrival is picked
 * on a noisier part of the record, after the P coda, so a residual that would
 * be alarming on a P pick is ordinary on an S. One threshold for both would
 * either cry wolf on every S or stay silent on a bad P.
 *
 * These are attention thresholds, not correctness thresholds - a large
 * residual on a distant, low-weight pick can be perfectly reasonable. They
 * exist so a scan down the column lands on the picks pulling the solution.
 */
/**
 * How bad a residual is, in three steps.
 *
 * Two thresholds rather than one, because analysts asked for the difference:
 * "worth a look" and "something is wrong" are different messages and a single
 * flag collapsed them.
 */
export type ResidualLevel = 'ok' | 'warning' | 'alert'

/**
 * Arrival time residuals, in SECONDS. Same for P and S.
 *
 * These come from the analysts using it, replacing a per-phase guess of mine
 * (P 0.5, S 0.75) that assumed S could be sloppier. It cannot: the same
 * numbers apply to both, and the second one is an alert rather than a looser
 * pass mark.
 */
export const ARRIVAL_RESIDUAL_THRESHOLDS = { warning: 0.5, alert: 0.75 } as const

/**
 * Station magnitude residuals, in MAGNITUDE UNITS.
 *
 * Also from the analysts, replacing my 0.5 guess. Applies to local and
 * duration station magnitudes alike.
 */
export const MAGNITUDE_RESIDUAL_THRESHOLDS = { warning: 0.8, alert: 1.0 } as const

function levelFor(
  value: number | undefined,
  thresholds: { warning: number; alert: number },
): ResidualLevel {
  if (value === undefined) return 'ok'
  const magnitude = Math.abs(value)
  if (magnitude > thresholds.alert) return 'alert'
  if (magnitude > thresholds.warning) return 'warning'
  return 'ok'
}

/** How bad this arrival's time residual is. */
export function arrivalResidualLevel(
  arrival: Pick<Arrival, 'residualSeconds'>,
): ResidualLevel {
  return levelFor(arrival.residualSeconds, ARRIVAL_RESIDUAL_THRESHOLDS)
}

/** How bad this station magnitude's residual is. */
export function magnitudeResidualLevel(
  stationMagnitude: Pick<StationMagnitude, 'residual'>,
): ResidualLevel {
  return levelFor(stationMagnitude.residual, MAGNITUDE_RESIDUAL_THRESHOLDS)
}

