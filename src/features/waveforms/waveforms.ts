import { decodeAndFilterSegment } from './waveformFilter.js'
import type { Arrival } from '../events/eventDetail'

const NS_PER_MS = 1_000_000

/**
 * A segment exactly as the backend sends it, with
 * `?filter=false&enableDeltaEncoding=true`.
 *
 * `data` is integer counts, delta encoded: the first value is absolute and
 * each one after is a difference. `startTime` is nanoseconds since the epoch.
 */
export interface RawWaveformSegment {
  startTime: number
  samplingRate: number
  data: number[]
  gain?: number
  deltaEncoded?: boolean
}

export interface RawWaveformChannel {
  network: string
  station: string
  channel: string
  locationCode: string
  segments: RawWaveformSegment[]
}

/**
 * What `apiGet` hands back for the waveform route.
 *
 * The array itself, NOT the `{message, data}` envelope: apiGet unwraps that
 * for every call. Typing it as the envelope here is what made the first
 * version of this parser silently return nothing.
 */
export type RawWaveforms = RawWaveformChannel[]

export interface WaveformSegment {
  /** Epoch milliseconds of the first sample. */
  startMs: number
  /** Epoch milliseconds of the last sample. */
  endMs: number
  samplingRate: number
  /** Sample interval in milliseconds. */
  dtMs: number
  /** Decoded, demeaned, bandpassed. Physical units once gain is applied. */
  samples: Float64Array
  /**
   * False when no filter design matched this sampling rate, in which case
   * the samples are decoded but raw. Say so rather than implying otherwise.
   */
  filtered: boolean
  /** Largest absolute sample, for normalising the trace into its lane. */
  peak: number
}

export interface WaveformChannel {
  /** "UU.FORK.EHZ.01" - the same identity the arrivals table uses. */
  streamId: string
  network: string
  station: string
  channel: string
  locationCode: string
  segments: WaveformSegment[]
  /** Largest absolute sample across every segment on this channel. */
  peak: number
  startMs: number
  endMs: number
  /** True when at least one segment could not be filtered. */
  partiallyUnfiltered: boolean
}

/**
 * Nanoseconds to milliseconds.
 *
 * The nanosecond value has already lost precision by the time it reaches us -
 * JSON.parse gives a double, and 1.79e18 exceeds the 2^53 a double holds
 * exactly, so the epoch is quantised to about 256 ns. That is irrelevant at
 * millisecond display resolution but worth knowing before anyone tries to
 * use this for sub-microsecond work.
 */
function nsToMs(ns: number): number {
  return ns / NS_PER_MS
}

/**
 * Reconstitutes one segment: delta decode, gain, demean, bandpass.
 *
 * All four live in waveformFilter.js, which is a hand-verified port of the
 * backend's C++ and is deliberately left as JSDoc-typed JavaScript so it can
 * be re-ported without a TypeScript rewrite.
 */
function parseSegment(raw: RawWaveformSegment): WaveformSegment {
  // Defaults spelled out rather than left to the filter: a payload without
  // the encoding flags is an unencoded payload, and saying so here keeps the
  // filter's contract exactly as its JSDoc states it.
  const decoded = decodeAndFilterSegment({
    ...raw,
    gain: raw.gain ?? 1,
    deltaEncoded: raw.deltaEncoded ?? false,
  }) as {
    data: Float64Array
    samplingRate: number
    filtered: boolean
  }
  const samples = decoded.data
  let peak = 0
  for (const value of samples) {
    const magnitude = Math.abs(value)
    if (magnitude > peak) peak = magnitude
  }
  const dtMs = 1000 / raw.samplingRate
  const startMs = nsToMs(raw.startTime)
  return {
    startMs,
    // The last SAMPLE, not the end of the window: a 200 Hz segment of n
    // samples spans (n-1) intervals.
    endMs: startMs + (samples.length - 1) * dtMs,
    samplingRate: raw.samplingRate,
    dtMs,
    samples,
    filtered: decoded.filtered,
    peak,
  }
}

/**
 * Turns the payload into channels with real samples on a real time base.
 *
 * Channels with no usable samples are dropped rather than carried as empty
 * lanes - a labelled blank row invites the reader to conclude the station was
 * quiet, when in fact nothing was sent.
 */
export function parseWaveforms(payload: RawWaveforms | null | undefined): WaveformChannel[] {
  const channels: WaveformChannel[] = []
  for (const raw of payload ?? []) {
    const segments = (raw.segments ?? [])
      .filter((segment) => Array.isArray(segment.data) && segment.data.length > 0)
      .map(parseSegment)
      .sort((a, b) => a.startMs - b.startMs)
    if (segments.length === 0) continue
    channels.push({
      streamId: [raw.network, raw.station, raw.channel, raw.locationCode]
        .filter((part) => part !== undefined && part !== '')
        .join('.'),
      network: raw.network,
      station: raw.station,
      channel: raw.channel,
      locationCode: raw.locationCode,
      segments,
      peak: segments.reduce((max, segment) => Math.max(max, segment.peak), 0),
      startMs: Math.min(...segments.map((segment) => segment.startMs)),
      endMs: Math.max(...segments.map((segment) => segment.endMs)),
      partiallyUnfiltered: segments.some((segment) => !segment.filtered),
    })
  }
  return channels
}

/** One trace's place in the record section. */
export interface Trace {
  channel: WaveformChannel
  /** Picks drawn on this trace, in time order. */
  arrivals: Arrival[]
  /** Distance to the source in km, from the arrival; undefined if unknown. */
  distanceKm?: number
  /** Lane index, 0 at the top. */
  lane: number
  /**
   * True when this trace carries more than one phase.
   *
   * Normally false: a P pick is made on the vertical and an S pick on a
   * horizontal, so each lands on its own trace and the CHANNEL says which
   * phase it is. It goes true only when the batch did not include the channel
   * a pick was made on, and the pick had to be drawn on a sibling - at which
   * point the drawing has to separate the phases itself.
   */
  mixedPhases: boolean
}

/**
 * Vertical or horizontal, from the channel's orientation code.
 *
 * Measured across every arrival in the sample data: 29 P picks, all on a
 * channel ending Z; 5 S picks, all on one ending E; no counterexamples. So
 * the orientation is a reliable enough proxy for phase to route a pick to the
 * right trace - but only a proxy, which is why nothing here infers a phase
 * FROM it. The pick says what phase it is; this only decides where to draw it.
 */
export type Orientation = 'vertical' | 'horizontal' | 'unknown'

export function orientationOf(channel: string): Orientation {
  const code = channel.trim().slice(-1).toUpperCase()
  if (code === 'Z') return 'vertical'
  if (code === '1' || code === '2' || code === 'E' || code === 'N') return 'horizontal'
  return 'unknown'
}

/** The phase's family: Pg, Pn and P are all P for the purpose of drawing. */
function phaseClass(phase: string): string {
  return phase.trim().slice(0, 1).toUpperCase()
}

/**
 * Orders channels into a record section and attaches their picks.
 *
 * Nearest at the top, matching the arrivals table - an analyst reading down
 * the table and down the traces should be looking at the same stations in the
 * same order. A channel whose distance is unknown sinks to the bottom rather
 * than claiming a position it cannot justify.
 *
 * A pick goes to the trace it was actually made on, by exact stream id. When
 * that channel is not in the batch it goes to a sibling of the same
 * orientation - an S picked on HHN belongs over HHE, not over the vertical.
 * Only when the station has nothing of that orientation does it fall back to
 * whatever trace there is, and that trace is then marked `mixedPhases` so the
 * drawing knows it has to tell the phases apart on its own.
 */
export function buildRecordSection(
  channels: WaveformChannel[],
  arrivals: Arrival[],
): Trace[] {
  const stationOf = (item: { network: string; station: string }) =>
    `${item.network}.${item.station}`

  // Which traces exist per station, so a pick can be routed among them.
  const tracesByStation = new Map<string, WaveformChannel[]>()
  for (const channel of channels) {
    const key = stationOf(channel)
    const existing = tracesByStation.get(key)
    if (existing) existing.push(channel)
    else tracesByStation.set(key, [channel])
  }

  /*
    Distance belongs to the STATION, not to whichever pick happened to land on
    this trace. A horizontal with no S pick still sits at its station's
    distance; taking it from the trace's own picks would send it to the bottom
    of the section, away from the vertical it shares a site with.
  */
  const distanceByStation = new Map<string, number>()
  for (const arrival of arrivals) {
    if (arrival.distanceKm === undefined) continue
    const key = stationOf(arrival)
    if (!distanceByStation.has(key)) distanceByStation.set(key, arrival.distanceKm)
  }

  // Route each pick to exactly one trace, then read the assignment back.
  const assigned = new Map<string, Arrival[]>()
  for (const arrival of arrivals) {
    const siblings = tracesByStation.get(stationOf(arrival))
    if (siblings === undefined || siblings.length === 0) continue
    const wanted = orientationOf(arrival.channel)
    const target =
      siblings.find((channel) => channel.streamId === arrival.streamId) ??
      siblings.find((channel) => orientationOf(channel.channel) === wanted) ??
      siblings[0]
    const existing = assigned.get(target.streamId)
    if (existing) existing.push(arrival)
    else assigned.set(target.streamId, [arrival])
  }

  return channels
    .map((channel) => {
      const matched = (assigned.get(channel.streamId) ?? [])
        .slice()
        .sort((a, b) => a.timeMs - b.timeMs)
      return {
        channel,
        arrivals: matched,
        distanceKm: distanceByStation.get(stationOf(channel)),
        lane: 0,
        mixedPhases: new Set(matched.map((arrival) => phaseClass(arrival.phase))).size > 1,
      }
    })
    .sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) {
        if (a.distanceKm === undefined) return 1
        if (b.distanceKm === undefined) return -1
        return a.distanceKm - b.distanceKm
      }
      // Same station: vertical above its horizontals, which is the order an
      // analyst reads a three-component set in.
      const rank = (trace: { channel: WaveformChannel }) =>
        orientationOf(trace.channel.channel) === 'vertical' ? 0 : 1
      return rank(a) - rank(b) || a.channel.streamId.localeCompare(b.channel.streamId)
    })
    .map((trace, lane) => ({ ...trace, lane }))
}

/**
 * How tall one trace is drawn, as a fraction of its lane.
 *
 * Below 0.5 so that two neighbours at full deflection cannot overlap and be
 * mistaken for one another's signal.
 */
export const TRACE_HALF_HEIGHT = 0.42

/**
 * The y centre of a lane.
 *
 * Negative going down, so lane 0 sits at the top with a plain (unreversed)
 * axis and a positive sample still deflects UP. Reversing the axis instead
 * would put lane 0 on top too, but it would also flip the ground motion,
 * which is not a thing to be clever about.
 */
export function laneY(lane: number): number {
  return -lane
}

/**
 * A segment as plottable points, normalised into its lane.
 *
 * Each trace is scaled by its OWN peak. Amplitudes across a record section
 * span orders of magnitude - in the sample event, 333 counts at the far
 * station against 14 212 at the near one - so a shared scale would flatten
 * every distant trace into a line and hide exactly the arrivals that need
 * checking. The cost is that relative amplitude is no longer readable off the
 * plot, which is why the peak is reported in the trace's label.
 *
 * `{x, y}` objects with `parsing: false` is what Chart.js decimation
 * requires; it will not decimate any other shape.
 */
export function segmentPoints(
  segment: WaveformSegment,
  lane: number,
  peak: number,
): { x: number; y: number }[] {
  const scale = peak > 0 ? TRACE_HALF_HEIGHT / peak : 0
  const centre = laneY(lane)
  const points = new Array<{ x: number; y: number }>(segment.samples.length)
  for (let i = 0; i < segment.samples.length; i++) {
    points[i] = { x: segment.startMs + i * segment.dtMs, y: centre + segment.samples[i] * scale }
  }
  return points
}

/** The time span covering every trace, for the initial axis range. */
export function recordSectionExtent(
  traces: Trace[],
): { minMs: number; maxMs: number } | null {
  if (traces.length === 0) return null
  let minMs = Infinity
  let maxMs = -Infinity
  for (const trace of traces) {
    if (trace.channel.startMs < minMs) minMs = trace.channel.startMs
    if (trace.channel.endMs > maxMs) maxMs = trace.channel.endMs
  }
  return { minMs, maxMs }
}
