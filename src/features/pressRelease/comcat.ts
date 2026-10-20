import { HISTORY_SEARCH, type History } from './pressRelease'

/**
 * The two ComCat questions a press release asks, as searchComCat.py asks
 * them: how many M2+ events within 15 mi since 1981, and the largest.
 *
 * Straight from the browser to USGS - its FDSN service allows any origin -
 * with plain fetch and NO credentials. These requests must never go through
 * apiGet: that would hand the reviewer's token to a third party.
 */
const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1'

/** ComCat can be slow on a big radius; firstInfo.py gives each query 30 s. */
export const COMCAT_TIMEOUT_MS = 30_000

const KM_PER_MI = 1.609344

/** %Y-%m-%dT%H:%M:%S in UTC, as the script formats its window. */
function isoSeconds(epochS: number): string {
  return new Date(epochS * 1000).toISOString().slice(0, 19)
}

/** The shared filters: the circle, the window, the size floor, the catalog. */
export function historyQuery(latitude: number, longitude: number, originTime: Date): string {
  const { minMagnitude, radiusMi, sinceEpochS, prePadS, catalog } = HISTORY_SEARCH
  const endS = originTime.getTime() / 1000 - prePadS
  const query = new URLSearchParams({
    format: 'geojson',
    latitude: latitude.toFixed(6),
    longitude: longitude.toFixed(6),
    maxradiuskm: (radiusMi * KM_PER_MI).toFixed(6),
  })
  // Only bounded below when the event is after 1981 - the script's rule.
  if (endS > sinceEpochS) query.set('starttime', isoSeconds(sinceEpochS))
  query.set('endtime', isoSeconds(endS))
  query.set('minmagnitude', String(minMagnitude))
  query.set('catalog', catalog)
  return query.toString()
}

export class ComcatError extends Error {
  readonly timedOut: boolean
  constructor(message: string, timedOut: boolean) {
    super(message)
    this.name = 'ComcatError'
    this.timedOut = timedOut
  }
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  // Our own timeout, combined with the caller's cancel, by hand rather than
  // AbortSignal.any - which older Safari lacks.
  const controller = new AbortController()
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, COMCAT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) throw new ComcatError(`ComCat answered ${response.status}.`, false)
    return await response.json()
  } catch (cause) {
    if (cause instanceof ComcatError) throw cause
    if (signal.aborted) throw cause
    if (timedOut) throw new ComcatError('ComCat did not answer within 30 seconds.', true)
    throw new ComcatError('Could not reach ComCat.', false)
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Both questions, in order. The largest is only asked for when there is
 * something to be largest of - as the script does - which also saves the
 * slower of the two queries in a quiet area.
 */
export async function searchHistory(
  latitude: number,
  longitude: number,
  originTime: Date,
  signal: AbortSignal,
): Promise<History> {
  const query = historyQuery(latitude, longitude, originTime)
  const counted = (await getJson(`${FDSN}/count?${query}`, signal)) as { count?: unknown }
  const count = Number(counted?.count)
  if (!Number.isFinite(count)) throw new ComcatError('ComCat sent a count that is not a number.', false)
  if (count === 0) return { count }

  const found = (await getJson(`${FDSN}/query?${query}&limit=1&orderby=magnitude`, signal)) as {
    features?: { properties?: { mag?: unknown; time?: unknown } }[]
  }
  const top = found?.features?.[0]?.properties
  const magnitude = Number(top?.mag)
  const timeMs = Number(top?.time)
  return Number.isFinite(magnitude) && Number.isFinite(timeMs)
    ? { count, largest: { magnitude, time: new Date(timeMs) } }
    : { count }
}
