import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { parseWaveforms, type RawWaveforms, type WaveformChannel } from './waveforms'

/**
 * Channels already fetched this session, keyed by event id.
 *
 * Module-level, like the event detail cache, so stepping back to the list and
 * into the same event again does not re-download two megabytes of samples.
 */
const cache = new Map<number, WaveformChannel[]>()

interface WaveformState {
  /** Which event this state describes, so a stale one is recognisable. */
  id: number | undefined
  channels: WaveformChannel[]
  loading: boolean
  error: string | null
}

/** The state an event starts in: whatever the cache already holds, or empty. */
function forEvent(eventId: number | undefined): WaveformState {
  return {
    id: eventId,
    channels: eventId === undefined ? [] : (cache.get(eventId) ?? []),
    loading: eventId !== undefined && !cache.has(eventId),
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
export function useWaveforms(eventId: number | undefined) {
  const { getToken, expireSession } = useAuth()
  const [state, setState] = useState<WaveformState>(() => forEvent(eventId))
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(
    async (id: number) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setState({ id, channels: cache.get(id) ?? [], loading: true, error: null })
      try {
        const raw = await apiGet<RawWaveforms>(
          `/events/${id}/waveforms?filter=false&enableDeltaEncoding=true`,
          getToken(),
          controller.signal,
        )
        if (controller.signal.aborted) return
        const channels = parseWaveforms(raw)
        cache.set(id, channels)
        setState({ id, channels, loading: false, error: null })
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        setState({
          id,
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
  const current = state.id === eventId ? state : forEvent(eventId)

  useEffect(() => {
    if (eventId === undefined || cache.has(eventId)) return
    // Deferred a tick, as useEventDetail does: `load` marks itself loading
    // synchronously, and doing that inside the effect body is a cascading
    // render React (and the lint rule) rightly objects to.
    const start = window.setTimeout(() => void load(eventId), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [eventId, load])

  return { ...current, reload: () => (eventId === undefined ? undefined : load(eventId)) }
}
