import type { CatalogEvent } from './types'

/** Escapes a string so it matches itself when used as a pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a matcher for the event-identifier search box.
 *
 * The query is treated as an unanchored, case-insensitive regular expression
 * against the identifier. That one rule covers both ways an analyst reaches
 * for an event:
 *
 *   "311"     -> every id containing 311, which for these ids means starting
 *   "766"     -> every id containing 766, so also the ones ending in it
 *   "^3115"   -> anchored to the start, for anyone who wants to be exact
 *   "766$"    -> anchored to the end
 *
 * A plain run of digits is already a valid regex that means "contains these
 * digits", so the common case needs no syntax at all.
 *
 * A query that is not valid regex - easy to type halfway through "31(" - is
 * matched literally instead of throwing or blanking the list. Patterns run
 * only against short numeric strings, so a pathological one has nothing to
 * backtrack over.
 */
export function buildEventMatcher(query: string): (event: CatalogEvent) => boolean {
  const trimmed = query.trim()
  if (trimmed === '') return () => true

  let pattern: RegExp
  try {
    pattern = new RegExp(trimmed, 'i')
  } catch {
    pattern = new RegExp(escapeRegExp(trimmed), 'i')
  }

  return (event) => pattern.test(String(event.id))
}

export function filterEvents(events: CatalogEvent[], query: string): CatalogEvent[] {
  const matches = buildEventMatcher(query)
  return query.trim() === '' ? events : events.filter(matches)
}
