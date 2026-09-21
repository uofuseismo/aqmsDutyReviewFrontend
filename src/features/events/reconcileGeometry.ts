/*
  Default import, then destructure. The package is CommonJS; a named import
  works through the bundler's interop in the browser but not under plain Node,
  which makes the module untestable outside a browser. This form works in both.
*/
import geographiclib from 'geographiclib-geodesic'

const { Geodesic } = geographiclib
import { selectEpochAt, stationKey, type Station } from '../stations/stations'
import type { Arrival, EventDetail, Origin, StationMagnitude } from './eventDetail'

/**
 * Fills in source-to-receiver distance and azimuth where the payload has none.
 *
 * Observations routinely arrive as network/station/channel/value/residual with
 * no geometry attached. Everything needed to work it out is already here: the
 * origin's position and the station list. So it is computed rather than left
 * blank, and marked as computed so nobody mistakes it for what the database
 * said.
 *
 * WGS84 via geographiclib, which agrees with the values the database does
 * supply to within about 30 m in distance and 0.1 degrees in azimuth on the
 * samples measured. Close enough to be useful, and the alternative is nothing.
 *
 * A station missing from the list is left alone - `geometrySource: 'unknown'`
 * and an em dash in the table. Inventing a position would be worse than
 * admitting there isn't one.
 */
export function computeGeometry(
  origin: Pick<Origin, 'latitude' | 'longitude'>,
  station: Pick<Station, 'latitude' | 'longitude'>,
): { distanceKm: number; azimuthDegrees: number } {
  const result = Geodesic.WGS84.Inverse(
    origin.latitude,
    origin.longitude,
    station.latitude,
    station.longitude,
  )
  return {
    distanceKm: (result.s12 ?? 0) / 1000,
    // azi1 is the azimuth AT THE SOURCE, which is the one wanted, and comes
    // back in (-180, 180]. The rest of the app speaks 0-360.
    azimuthDegrees: (((result.azi1 ?? 0) % 360) + 360) % 360,
  }
}

function reconcileArrival(
  arrival: Arrival,
  origin: Origin,
  epochs: Map<string, Station[]>,
): Arrival {
  if (arrival.geometrySource === 'reported') return arrival

  // The epoch is chosen at the ORIGIN time, not now: an observation from
  // years ago belongs to wherever the instrument stood then.
  const station = selectEpochAt(epochs.get(stationKey(arrival.network, arrival.station)), origin.time)
  if (station === undefined) return arrival

  const { distanceKm, azimuthDegrees } = computeGeometry(origin, station)
  return { ...arrival, distanceKm, azimuthDegrees, geometrySource: 'computed' }
}

/**
 * The same treatment for a station magnitude.
 *
 * These carry the same network/station/channel identity and the same optional
 * geometry as an arrival, and are just as likely to arrive without it - so
 * they are filled from the same station list rather than left blank in a
 * table that sits next to one showing distances.
 */
function reconcileStationMagnitude(
  stationMagnitude: StationMagnitude,
  origin: Origin,
  epochs: Map<string, Station[]>,
): StationMagnitude {
  if (stationMagnitude.geometrySource === 'reported') return stationMagnitude
  const station = selectEpochAt(
    epochs.get(stationKey(stationMagnitude.network, stationMagnitude.station)),
    origin.time,
  )
  if (station === undefined) return stationMagnitude
  const { distanceKm, azimuthDegrees } = computeGeometry(origin, station)
  return { ...stationMagnitude, distanceKm, azimuthDegrees, geometrySource: 'computed' }
}

/**
 * Returns the detail with every arrival's geometry filled in where possible.
 *
 * The same object is returned when nothing needed filling, so a memo upstream
 * does not invalidate and the rows keep their identity.
 */
export function reconcileGeometry(
  detail: EventDetail | null,
  epochs: Map<string, Station[]>,
): EventDetail | null {
  if (detail === null) return null
  if (epochs.size === 0) return detail
  const settled = (source: 'reported' | 'computed' | 'unknown') => source === 'reported'
  if (
    detail.origins.every(
      (o) =>
        o.arrivals.every((a) => settled(a.geometrySource)) &&
        o.magnitudes.every((m) =>
          m.stationMagnitudes.every((sm) => settled(sm.geometrySource)),
        ),
    )
  ) {
    return detail
  }

  let changed = false
  const origins = detail.origins.map((origin) => {
    let originChanged = false
    const arrivals = origin.arrivals.map((arrival) => {
      const next = reconcileArrival(arrival, origin, epochs)
      if (next !== arrival) originChanged = true
      return next
    })
    const magnitudes = origin.magnitudes.map((magnitude) => {
      let magnitudeChanged = false
      const stationMagnitudes = magnitude.stationMagnitudes.map((sm) => {
        const next = reconcileStationMagnitude(sm, origin, epochs)
        if (next !== sm) magnitudeChanged = true
        return next
      })
      if (!magnitudeChanged) return magnitude
      originChanged = true
      return { ...magnitude, stationMagnitudes }
    })
    if (!originChanged) return origin
    changed = true
    return { ...origin, arrivals, magnitudes }
  })

  if (!changed) return detail
  const preferredOrigin =
    origins.find((o) => o.id === detail.preferredOrigin?.id) ?? origins[0]
  return { ...detail, origins, preferredOrigin }
}
