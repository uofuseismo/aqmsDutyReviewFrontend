/**
 * UTC ticks for a time axis built on a plain linear scale.
 *
 * Chart.js has a time scale, but it formats through a date adapter that works
 * in the browser's local zone. This app is UTC everywhere - the summary bar,
 * the arrivals table, the origin time - and a record section labelled in
 * Mountain Time next to a pick list labelled in UTC is a genuine way to
 * misread an arrival. Generating the ticks here keeps one timezone in the app
 * and drops the date-adapter dependency entirely.
 */

/**
 * Tick intervals in milliseconds.
 *
 * Only values that divide a minute, an hour or a day evenly, so ticks land on
 * whole seconds and whole minutes rather than at 3.7-second intervals.
 */
const STEPS_MS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 21_600_000, 43_200_000, 86_400_000,
]

/** The smallest nice step that keeps the tick count at or under the target. */
export function chooseStepMs(spanMs: number, targetCount: number): number {
  const ideal = spanMs / Math.max(1, targetCount)
  return STEPS_MS.find((step) => step >= ideal) ?? STEPS_MS[STEPS_MS.length - 1]
}

/**
 * Tick positions across a span, aligned to whole multiples of the step.
 *
 * Alignment is to the epoch, which is itself a UTC boundary, so a 30-second
 * step lands on :00 and :30 of every minute.
 */
export function timeTicks(minMs: number, maxMs: number, targetCount = 8): number[] {
  if (!(maxMs > minMs)) return []
  const step = chooseStepMs(maxMs - minMs, targetCount)
  const ticks: number[] = []
  for (let t = Math.ceil(minMs / step) * step; t <= maxMs; t += step) ticks.push(t)
  return ticks
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

/**
 * A tick label, carrying only as much precision as the step needs.
 *
 * Sub-second steps show tenths, because at that zoom the question is where a
 * pick sits inside a second. Coarser steps drop them, because a column of
 * ".0" is noise.
 */
export function formatTick(ms: number, stepMs: number): string {
  const date = new Date(ms)
  const hh = pad(date.getUTCHours())
  const mm = pad(date.getUTCMinutes())
  const ss = pad(date.getUTCSeconds())
  if (stepMs < 1_000) {
    return `${hh}:${mm}:${ss}.${Math.floor(date.getUTCMilliseconds() / 100)}`
  }
  if (stepMs < 60_000) return `${hh}:${mm}:${ss}`
  return `${hh}:${mm}`
}
