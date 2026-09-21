import { selectEpochAt, stationKey, type Station } from '../stations/stations'
import { shapeForPhases, type StationShape } from './markerIcons'
import { worseStatus, type PickStatus } from './pickPalette'
import type { MapStation } from './EventMap'

/**
 * Anything that can be drawn at a station: an arrival, a station magnitude.
 *
 * Only what the map needs is required, so a new kind of observation can be
 * plotted without the map learning about it.
 */
export interface Plottable {
  network: string
  station: string
  /** Phase, where there is one. Absent means "just a triangle". */
  phase?: string
  status: PickStatus
}

/**
 * The name a marker gets when the caller does not supply one.
 *
 * Phases where there are phases, so "UU.FOR2, S, needs attention" rather than
 * a bare station code that says nothing about why it is red.
 */
function defaultLabel(station: string, group: Plottable[]): string {
  const phases = [...new Set(group.map((o) => o.phase).filter((p) => p !== undefined))]
  const worst = group.reduce<PickStatus>((level, o) => worseStatus(level, o.status), 'ok')
  return [
    station,
    phases.join(' and '),
    worst === 'alert' ? 'alert' : worst === 'warning' ? 'needs a look' : undefined,
  ]
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
}

/**
 * Groups observations by station and resolves each to a position.
 *
 * Positions come from the epoch covering the origin time, the same rule the
 * geometry reconciliation uses - so a marker and the distance in the table
 * beside it always refer to the same instrument.
 *
 * Several observations at one station collapse to a single marker: two dots a
 * few metres apart for the same site is noise. The marker's shape reflects
 * all of their phases together, and it is flagged if ANY of them is - one bad
 * pick is worth seeing, and hiding it behind a good one at the same site
 * defeats the point.
 */
export function toMapStations<T extends Plottable>(
  observations: T[],
  epochs: Map<string, Station[]>,
  originTime: Date,
  tooltip: (station: string, group: T[]) => MapStation['tooltip'],
  /**
   * The marker's accessible name. Defaults to the station and its state,
   * which is the least a screen reader needs to tell two markers apart.
   */
  label: (station: string, group: T[]) => string = defaultLabel,
): { stations: MapStation[]; unplacedCount: number } {
  const grouped = new Map<string, T[]>()
  for (const observation of observations) {
    const key = stationKey(observation.network, observation.station)
    const existing = grouped.get(key)
    if (existing) existing.push(observation)
    else grouped.set(key, [observation])
  }

  const stations: MapStation[] = []
  let unplacedCount = 0
  for (const [key, group] of grouped) {
    const position = selectEpochAt(epochs.get(key), originTime)
    if (position === undefined) {
      unplacedCount += group.length
      continue
    }
    const phases = group.map((o) => o.phase).filter((p): p is string => p !== undefined)
    // No phases at all - a magnitude observation - is a plain triangle.
    const shape: StationShape = phases.length === 0 ? 'p' : shapeForPhases(phases)
    // One marker for several picks takes the WORST of them: a good pick at
    // the same site must not hide a bad one.
    const status = group.reduce<PickStatus>((level, o) => worseStatus(level, o.status), 'ok')
    stations.push({
      key,
      latitude: position.latitude,
      longitude: position.longitude,
      shape,
      status,
      tooltip: tooltip(key, group),
      label: label(key, group),
    })
  }
  return { stations, unplacedCount }
}
