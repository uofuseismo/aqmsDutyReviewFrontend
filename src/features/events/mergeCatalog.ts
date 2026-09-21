import type { CatalogEvent } from './types'

/**
 * Whether two parsed events describe the same solution.
 *
 * Fields are compared explicitly rather than by a generic deep-equal: the
 * list is the thing this decides re-renders for, so it should be obvious
 * which fields count, and `time` is a Date whose identity would never match
 * even when the instant does (timeMs carries it instead).
 */
function sameEvent(a: CatalogEvent, b: CatalogEvent): boolean {
  return (
    a.id === b.id &&
    a.timeMs === b.timeMs &&
    a.version === b.version &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.depthKm === b.depthKm &&
    a.magnitude === b.magnitude &&
    a.magnitudeType === b.magnitudeType &&
    a.eventType === b.eventType &&
    a.reviewStatus === b.reviewStatus &&
    a.geographicType === b.geographicType &&
    a.originSource === b.originSource &&
    a.maximumAzimuthalGap === b.maximumAzimuthalGap &&
    a.weightedRootMeanSquaredError === b.weightedRootMeanSquaredError &&
    a.numberOfDefiningPhases === b.numberOfDefiningPhases
  )
}

/**
 * Folds a freshly fetched catalog into the one already on screen, keeping the
 * object identity of every event that has not actually changed.
 *
 * This is what stops a poll from being more expensive than it is worth. The
 * rows are memoised on the event object, so a reused reference means the row
 * skips rendering entirely; replacing the array wholesale would hand all ~670
 * rows new identities every poll and re-render the whole table for nothing.
 *
 * When the fetch turns out to be identical throughout, the PREVIOUS array is
 * returned rather than a new one holding the same elements - so the sort memo
 * upstream does not recompute either, and React sees no change at all.
 *
 * Cost is one map build plus one field comparison per event: well under a
 * millisecond at this size.
 */
export function mergeCatalog(
  previous: CatalogEvent[],
  incoming: CatalogEvent[],
): CatalogEvent[] {
  if (previous.length === 0) return incoming

  const byId = new Map(previous.map((event) => [event.id, event]))
  let changed = incoming.length !== previous.length

  const merged = incoming.map((event, index) => {
    const existing = byId.get(event.id)
    if (existing !== undefined && sameEvent(existing, event)) {
      // Order matters too: the same event at a new position is a change to
      // the list even though the event itself is untouched.
      if (previous[index] !== existing) changed = true
      return existing
    }
    changed = true
    return event
  })

  return changed ? merged : previous
}
