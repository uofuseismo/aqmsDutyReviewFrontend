/** Formats a whole number of seconds as m:ss. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * The countdown as words, for an accessible label. Screen readers make a mess
 * of "1:59" - some say "one fifty-nine", some spell out the colon - so the
 * label spells out the units instead.
 */
export function formatCountdownWords(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`)
  }
  return parts.join(' ')
}

/**
 * The session length at a glance: hours and minutes, no seconds.
 *
 * Used in the account menu, where the question is "have I got time to start
 * this?" - a ticking seconds field there is motion in the corner of the eye
 * answering a question nobody asked.
 *
 * It also removes a real ambiguity. The m:ss form renders a two-hour session
 * as "119:42", which reads as hours and minutes at a glance and is wrong by
 * a factor of sixty.
 *
 * Minutes are floored, never rounded, so the figure never claims more time
 * than is left.
 */
export function formatCountdownCoarse(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  if (safe < 60) return 'under a minute'

  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
