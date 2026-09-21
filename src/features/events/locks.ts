import type { CatalogEvent } from './types'

/**
 * A row of AQMS's `jasieventlock`: an event somebody is working on.
 *
 * The primary key is the event id, so there is at most one lock per event
 * and never a conflict to resolve.
 *
 * `user` and `acquiredAt` are optional because the serializer emits each only
 * when the underlying column is set. A lock whose user name is NULL comes
 * back as the string "unknown" rather than being dropped - deliberately, on
 * the backend's part: reporting a held event as free would be the worse
 * mistake.
 */
export interface RawEventLock {
  eventIdentifier?: number
  user?: string
  /** ISO-8601 with a Z suffix, e.g. "2026-09-04T17:33:00Z". */
  acquiredAt?: string
}

export interface EventLock {
  eventId: number
  user: string
  /** null when the column was empty or unparseable. */
  acquiredAt: Date | null
}

const UNKNOWN_USER = 'unknown'

/**
 * Indexes the locks by event id.
 *
 * A Map rather than an array because the only question ever asked is "is THIS
 * event locked?", once per rendered row. The backend returns the whole table
 * - a handful of rows - and expects the client to intersect it with whatever
 * it happens to be showing.
 *
 * Locks that name no event are dropped: there is nothing to intersect them
 * against. Locks naming an event the catalog does not hold are KEPT, because
 * that is not an error - an event locked since the last poll is newer than
 * the catalog, and an abandoned lock is older than its window. In a real
 * sample, every one of seven locks fell outside the catalog.
 */
export function indexLocks(rows: RawEventLock[]): Map<number, EventLock> {
  const byEvent = new Map<number, EventLock>()
  for (const row of rows) {
    if (typeof row.eventIdentifier !== 'number') continue
    const parsed = row.acquiredAt ? new Date(row.acquiredAt) : null
    byEvent.set(row.eventIdentifier, {
      eventId: row.eventIdentifier,
      user: row.user && row.user.trim() !== '' ? row.user : UNKNOWN_USER,
      acquiredAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    })
  }
  return byEvent
}

export function lockFor(
  locks: Map<number, EventLock>,
  event: Pick<CatalogEvent, 'id'>,
): EventLock | undefined {
  return locks.get(event.id)
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/**
 * "4 minutes ago", "yesterday", "17 months ago".
 *
 * Age is the whole point of showing a lock: the same words next to a lock
 * from four minutes ago and one from March 2025 would train people to ignore
 * both. Coarsens as it gets older, because nobody needs the minute on a
 * year-old lock.
 */
export function formatLockAge(acquiredAt: Date | null, now: Date = new Date()): string {
  if (acquiredAt === null) return 'at an unknown time'
  const seconds = Math.round((acquiredAt.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return 'just now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 2592000) return relative.format(Math.round(seconds / 86400), 'day')
  if (abs < 31536000) return relative.format(Math.round(seconds / 2592000), 'month')
  return relative.format(Math.round(seconds / 31536000), 'year')
}
