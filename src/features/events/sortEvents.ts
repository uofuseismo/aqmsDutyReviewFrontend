import type { CatalogEvent } from './types'

export type SortKey =
  | 'id'
  | 'time'
  | 'latitude'
  | 'longitude'
  | 'magnitude'
  | 'eventType'
  | 'geographicType'
  | 'reviewStatus'

export type SortDirection = 'asc' | 'desc'

export interface Sort {
  key: SortKey
  direction: SortDirection
}

/** Newest first, matching the order the API already returns. */
export const DEFAULT_SORT: Sort = { key: 'time', direction: 'desc' }

function value(event: CatalogEvent, key: SortKey): number | string | undefined {
  switch (key) {
    case 'id':
      return event.id
    case 'time':
      return event.timeMs
    // Unlocated events have no coordinate to compare, so they sink to the
    // bottom with the other blanks instead of clustering at zero and sorting
    // as though they sat on the prime meridian.
    case 'latitude':
      return event.hasLocation ? event.latitude : undefined
    case 'longitude':
      return event.hasLocation ? event.longitude : undefined
    case 'magnitude':
      return event.magnitude
    case 'eventType':
      return event.eventType
    case 'geographicType':
      return event.geographicType
    case 'reviewStatus':
      return event.reviewStatus
  }
}

/**
 * Sorts a copy, leaving the fetched array untouched.
 *
 * Events with no magnitude sink to the bottom in both directions rather than
 * riding to the top of an ascending sort. 76 of 673 events have none, and a
 * screen full of blanks is not a useful answer to "show me the smallest".
 */
export function sortEvents(events: CatalogEvent[], sort: Sort): CatalogEvent[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...events].sort((a, b) => {
    const av = value(a, sort.key)
    const bv = value(b, sort.key)

    if (av === undefined && bv === undefined) return a.timeMs - b.timeMs
    if (av === undefined) return 1
    if (bv === undefined) return -1

    let comparison: number
    if (typeof av === 'number' && typeof bv === 'number') {
      comparison = av - bv
    } else {
      comparison = String(av).localeCompare(String(bv))
    }
    // Ties fall back to time so the order is total and stable to look at.
    return comparison !== 0 ? comparison * factor : b.timeMs - a.timeMs
  })
}
