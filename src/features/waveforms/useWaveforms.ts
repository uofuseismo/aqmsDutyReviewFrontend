import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { parseWaveforms, type RawWaveforms, type WaveformChannel } from './waveforms'

/**
 * Channels already fetched this session, keyed by event AND preferred origin.
 *
 * Module-level, like the event detail cache, so stepping back to the list and
 * into the same event again does not re-download two megabytes of samples.
 *
 * The origin is in the key because the route answers for the preferred
 * origin's picks. An analyst who repicks in the processing tool makes a new
 * preferred origin, often with picks on other stations; keyed by event alone,
 * the old channels stayed cached and the new picks had no traces under them.
 */
const cache = new Map<string, WaveformChannel[]>()

function keyOf(eventId: number | undefined, originId: number | undefined): string | undefined {
  return eventId === undefined ? undefined : `${eventId}:${originId ?? 'none'}`
}

interface WaveformState {
  /** Which event and origin this state describes, so a stale one is recognisable. */
  key: string | undefined
  channels: WaveformChannel[]
  loading: boolean
  error: string | null
}

/** The state an event starts in: whatever the cache already holds, or empty. */
function forKey(key: string | undefined): WaveformState {
  return {
    key,
    channels: key === undefined ? [] : (cache.get(key) ?? []),
    loading: key !== undefined && !cache.has(key),
    error: null,
  }
}

/**
 * Loads the waveforms behind an origin's picks.
 *
 * `filter=false&enableDeltaEncoding=true` is not a preference, it is the
 * cheaper contract: integer counts delta-encode and gzip far better than the
 * fractional doubles a server-side filter produces, and the bandpass runs
 * here instead. The backend author measured 92 KB against 135 KB on this very
 * event - smaller AND lossless. See waveformFilter.js.
 *
 * Not stale-while-revalidate, unlike the event detail: samples for a fixed
 * time window do not change when somebody reviews the event, and re-fetching
 * megabytes to confirm that would be a poor trade on a phone.
 */
export function useWaveforms(eventId: number | undefined, originId?: number) {
  const { getToken, expireSession } = useAuth()
  const key = keyOf(eventId, originId)
  const [state, setState] = useState<WaveformState>(() => forKey(key))
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(
    async (id: number, key: string) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setState({ key, channels: cache.get(key) ?? [], loading: true, error: null })
      try {
        const raw = await apiGet<RawWaveforms>(
          `/events/${id}/waveforms?filter=false&enableDeltaEncoding=true`,
          getToken(),
          controller.signal,
        )
        if (controller.signal.aborted) return
        const channels = parseWaveforms(raw)
        cache.set(key, channels)
        setState({ key, channels, loading: false, error: null })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        setState({
          key,
          channels: [],
          loading: false,
          error: cause instanceof Error ? cause.message : 'Could not load the waveforms',
        })
      }
    },
    [getToken, expireSession],
  )

  /*
    Switching events is resolved DURING RENDER, not in an effect.

    Setting state from an effect body to catch up with a changed prop renders
    the stale event's channels once before correcting itself, which on this
    screen means one frame of the previous event's traces. Deriving it here
    means the right thing is on screen the first time.
  */
  const current = state.key === key ? state : forKey(key)

  useEffect(() => {
    if (eventId === undefined || key === undefined || cache.has(key)) return
    // Deferred a tick, as useEventDetail does: `load` marks itself loading
    // synchronously, and doing that inside the effect body is a cascading
    // render React (and the lint rule) rightly objects to.
    const start = window.setTimeout(() => void load(eventId, key), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [eventId, key, load])

  return {
    ...current,
    reload: () => (eventId === undefined || key === undefined ? undefined : load(eventId, key)),
  }
}
