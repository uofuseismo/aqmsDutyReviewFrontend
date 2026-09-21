import type { CatalogEvent } from './types'

/**
 * Magnitude type as an analyst writes it. AQMS stores the long name, and an
 * unrecognised type is passed through rather than hidden.
 *
 * "human" is not a measurement method - it is a number the analyst typed in
 * with no observations behind it. It still needs a label in the same style as
 * the others, or the column reads "1.24 Ml" on one row and "0.00 human" on
 * the next.
 */
const MAGNITUDE_ABBREVIATIONS: Record<string, string> = {
  local: 'Ml',
  duration: 'Md',
  moment: 'Mw',
  body: 'Mb',
  surface: 'Ms',
  human: 'Mh',
}

export function magnitudeLabel(type: string | undefined): string {
  if (!type) return ''
  return MAGNITUDE_ABBREVIATIONS[type.toLowerCase()] ?? type
}

/** Magnitude to two decimals, or an em dash when there is none. */
export function formatMagnitude(magnitude: number | undefined): string {
  return magnitude === undefined ? '—' : magnitude.toFixed(2)
}

/**
 * UTC, always, and said so in the header.
 *
 * Origin times are compared against other agencies and written into reports;
 * rendering them in whatever zone the reviewer's laptop happens to be set to
 * would be a genuine source of error, not a convenience.
 */
const utcParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatUtc(date: Date): string {
  const p = Object.fromEntries(utcParts.formatToParts(date).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

/**
 * Wall-clock time in the reader's own zone, with the zone named.
 *
 * Deliberately NOT UTC, unlike every other time in this app. Origin times are
 * data - they get compared against other agencies and written into reports,
 * so they stay UTC. "Updated" is not data; it is a freshness signal, read by
 * glancing at the clock on the wall. Rendering it in UTC makes the reader do
 * an offset subtraction, and then work out whether daylight saving is
 * currently in effect, to answer "is this stale?".
 *
 * The short zone name comes along so it is unambiguous which it is, and so
 * the MDT/MST question answers itself.
 */
const localTimeParts = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
})

export function formatLocalTimeOnly(date: Date): string {
  return localTimeParts.format(date)
}

const localDateTime = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Full local date and time, e.g. "2026-09-02 14:53:53". */
export function formatLocalDateTime(date: Date): string {
  return localDateTime.format(date).replace(',', '')
}

/**
 * The reader's current time-zone abbreviation, e.g. "MDT".
 *
 * Shown once in a column header rather than repeated on every row, and read
 * from the machine so the daylight-saving switch needs no maintenance.
 */
export function localZoneAbbreviation(): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(
    new Date(),
  )
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'local'
}

export function formatUtcTimeOnly(date: Date): string {
  const p = Object.fromEntries(utcParts.formatToParts(date).map((x) => [x.type, x.value]))
  return `${p.hour}:${p.minute}:${p.second}`
}

export function formatUtcDateOnly(date: Date): string {
  const p = Object.fromEntries(utcParts.formatToParts(date).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/** Signed decimal degrees, 4 dp (~11 m) - the precision a catalog quotes. */
export function formatLatitude(latitude: number): string {
  return latitude.toFixed(4)
}

export function formatLongitude(longitude: number): string {
  return longitude.toFixed(4)
}

export function formatDepth(depthKm: number): string {
  return `${depthKm.toFixed(2)} km`
}

/**
 * Turns a database enum into something readable: underscores become spaces
 * and the first letter is capitalised.
 *
 * AQMS event types are stored with underscores - "quarry_blast",
 * "nuclear_explosion", "sonic_boom" - and this catalog happens to contain
 * only "earthquake", so the difference is invisible today and would have
 * shown up the first busy day a quarry blast came through. Applied to every
 * enum-ish label rather than just event type, since they all come from the
 * same kind of column.
 */
export function humanize(value: string | undefined): string {
  // An absent enum is an empty label, not a crash. The callers decide whether
  // a blank or an em dash is the right thing to show in their layout.
  if (!value) return ''
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * How each review state is coloured. Neutral for untouched, warning for a
 * review someone abandoned part-way, and green only once it is finalized.
 */
export function reviewStatusPalette(status: string): string {
  switch (status) {
    case 'automatic':
      return 'gray'
    case 'incomplete':
      return 'orange'
    case 'human':
      return 'blue'
    case 'finalized':
      return 'green'
    /*
      Confirmed real on 2026-09-11 by event 31154256, which arrived with
      `reviewStatus: "cancelled"` on its origin - before that it fell through
      to the unknown-status purple.

      Red, because it is the one status that means "this is not an event".
      The others read as a progression - untouched, part-done, reviewed,
      signed off - and this one terminates it. Red on a BADGE does not
      collide with red on a residual: that language lives inside the tables
      and on the map, where it means a number wants checking.
    */
    case 'cancelled':
    case 'canceled':
      return 'red'
    default:
      return 'purple' // a status this build predates - visibly odd on purpose
  }
}

export function eventSortKey(event: CatalogEvent): number {
  return event.timeMs
}
