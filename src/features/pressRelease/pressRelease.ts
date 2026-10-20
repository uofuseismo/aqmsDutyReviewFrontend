import geographiclib from 'geographiclib-geodesic'
import { FIRST_INFO_CITIES } from './firstInfoCities'

const { Geodesic } = geographiclib

/**
 * The press release, as firstInfo.py writes it.
 *
 * A port of the alarm that runs on the database machine today, so the app
 * can take its place. The sentences are kept word for word - except "the the
 * first event", which was a typo - and so are the script's habits that show
 * in the text: distances truncated to whole miles. Days and hours are NOT
 * zero-padded ("October 8", "9:48 PM"), unlike the script's %d and %I. The
 * exceptions are deliberate and noted where they are made.
 */

/** UUSS is in Salt Lake City; every time in a release is local time there. */
export const RELEASE_TIME_ZONE = 'America/Denver'

/**
 * Production ComCat's event pages - the backend's own default for
 * comcatPrefix, used here only if the setting never arrives.
 */
export const DEFAULT_COMCAT_PREFIX = 'https://earthquake.usgs.gov/earthquakes/eventpage/uu'

/**
 * Where the survey lives: the event's page on whichever ComCat this system
 * publishes to, plus /tellus.
 *
 * From comcatPrefix, not hard-coded. A test system's event ids are not the
 * ids production publishes - the sample release's 31159041 is uu80160861 on
 * ComCat - so a hard-coded production link from a test draft 404s, or lands
 * on an unrelated event. The prefix follows the system the draft came from.
 */
export function dyfiUrl(eventId: number, comcatPrefix?: string): string {
  return `${comcatPrefix || DEFAULT_COMCAT_PREFIX}${eventId}/tellus`
}

/** The history the release quotes: how many, since when, how far, how big. */
export const HISTORY_SEARCH = {
  minMagnitude: 2,
  radiusMi: 15,
  /** 1981-01-01T00:00:00Z, as seconds - firstInfo.py's min_time. */
  sinceEpochS: 347155200,
  /** Seconds before the origin the window closes, so the event cannot count itself. */
  prePadS: 10,
  catalog: 'uu',
} as const

const KM_PER_MI = 1.609344

export interface NearestPlace {
  /** Whole miles, truncated as firstInfo.py's %d does: 7.9 mi reads "7 mi". */
  distanceMi: number
  /** Where the epicentre is FROM the place: "south-east" (of Madison Junction). */
  bearing: string
  name: string
}

const BEARINGS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const

/** Eight points, each owning the 45° centred on it. */
export function bearingWord(azimuthDegrees: number): string {
  const normalised = ((azimuthDegrees % 360) + 360) % 360
  return BEARINGS[Math.round(normalised / 45) % 8]
}

/**
 * The nearest listed place, and which way the epicentre lies from it.
 *
 * WGS84 geodesics via geographiclib rather than a haversine: the app already
 * measures station distances this way, and the two agree to well under the
 * mile the result is truncated to.
 *
 * firstInfo.py had a bug here: it only recorded the winning index when a
 * LATER place beat the first one, so an event nearest the first row of the
 * CSV (Orofino, ID) came out with no place at all. This keeps the index from
 * the start.
 */
export function nearestPlace(latitude: number, longitude: number): NearestPlace {
  let best = -1
  let bestKm = Infinity
  FIRST_INFO_CITIES.forEach(([lat, lon], index) => {
    const km = (Geodesic.WGS84.Inverse(latitude, longitude, lat, lon).s12 ?? Infinity) / 1000
    if (km < bestKm) {
      bestKm = km
      best = index
    }
  })
  const [lat, lon, name] = FIRST_INFO_CITIES[best]
  // FROM the place TO the epicentre - the back azimuth, in the script's
  // terms - because the sentence says the epicentre is <bearing> of <place>.
  const azimuth = Geodesic.WGS84.Inverse(lat, lon, latitude, longitude).azi1 ?? 0
  return { distanceMi: Math.trunc(bestKm / KM_PER_MI), bearing: bearingWord(azimuth), name }
}

/** firstInfo.py's magnitude_to_adjective: below 3 it is just "an". */
export function magnitudeAdjective(magnitude: number): string {
  if (magnitude >= 8) return 'a great'
  if (magnitude >= 7) return 'a major'
  if (magnitude >= 6) return 'a strong'
  if (magnitude >= 5) return 'a moderate'
  if (magnitude >= 4) return 'a light'
  if (magnitude >= 3) return 'a minor'
  return 'an'
}

/*
  strftime, pinned to Denver. Built from parts rather than toLocaleString so
  the layout is exactly the script's - "09:48 PM on October 18, 2026" - and
  does not drift with the browser's locale.
*/
const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: RELEASE_TIME_ZONE,
  year: 'numeric',
  month: 'long',
  // Neither zero-padded: "October 8" and "9:48 PM", not strftime's
  // "October 08" and "09:48 PM".
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})

function pieces(date: Date) {
  const got: Record<string, string> = {}
  for (const part of parts.formatToParts(date)) got[part.type] = part.value
  return {
    month: got.month,
    day: got.day,
    year: got.year,
    hour: got.hour,
    minute: got.minute,
    ampm: (got.dayPeriod ?? '').toUpperCase(),
    zone: got.timeZoneName,
  }
}

/** %B %-d, %Y %-I:%M %p %Z - "October 19, 2026 7:14 AM MDT", "October 8, …" */
export function formatReleased(date: Date): string {
  const p = pieces(date)
  return `${p.month} ${p.day}, ${p.year} ${p.hour}:${p.minute} ${p.ampm} ${p.zone}`
}

/** %-I:%M %p on %B %-d, %Y - "9:48 PM on October 18, 2026" */
export function formatOccurred(date: Date): string {
  const p = pieces(date)
  return `${p.hour}:${p.minute} ${p.ampm} on ${p.month} ${p.day}, ${p.year}`
}

/** %B %-d, %Y - "March 30, 2014" */
export function formatDay(date: Date): string {
  const p = pieces(date)
  return `${p.month} ${p.day}, ${p.year}`
}

/** What ComCat said about the area's past. Null when it could not be asked. */
export interface History {
  count: number
  largest?: { magnitude: number; time: Date }
}

export interface ReleaseInput {
  eventId: number
  originTime: Date
  latitude: number
  longitude: number
  magnitude: number
  /** From app settings; the survey link is built on it. */
  comcatPrefix?: string
  /** Null drops the history sentence, as firstInfo.py does when ComCat fails. */
  history: History | null
  releasedAt: Date
}

export function buildPressRelease(input: ReleaseInput): string {
  const { eventId, originTime, latitude, longitude, magnitude, comcatPrefix, history, releasedAt } =
    input
  const place = nearestPlace(latitude, longitude)
  const { minMagnitude, radiusMi } = HISTORY_SEARCH

  let text = ''
  text += 'PRESS RELEASE\n\n'
  text += 'University of Utah Seismograph Stations\n\n'
  text += `Released: ${formatReleased(releasedAt)}\n\n`
  text +=
    `The University of Utah Seismograph Stations (UUSS) reports that ` +
    `${magnitudeAdjective(magnitude)} earthquake of magnitude ${magnitude.toFixed(1)} ` +
    `occurred at ${formatOccurred(originTime)}.  `
  text += `The epicenter of the shock was located about ${place.distanceMi} mi ${place.bearing} of ${place.name}.  `
  if (history !== null) {
    if (history.count > 0) {
      text +=
        `Since 1981, the UUSS has located ${history.count} M${minMagnitude} or greater events ` +
        `within ${radiusMi} mi of this event's epicenter.`
      if (history.largest) {
        text +=
          `  The largest of these events was a magnitude ${history.largest.magnitude.toFixed(1)} ` +
          `which occurred on ${formatDay(history.largest.time)}.`
      }
    } else {
      text += `This is the first event since 1981 that the UUSS has located within ${radiusMi} mi of this event's epicenter.`
    }
  }
  text +=
    '\n\nAnyone who felt the earthquake is encouraged to fill out a survey form on the US ' +
    `Geological Survey website: ${dyfiUrl(eventId, comcatPrefix)}`
  return text
}
