import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { hasPending, parseAlarms, type Alarm, type RawAlarm } from './alarms'

/** Keyed by event id, like the detail and waveform caches. */
const cache = new Map<number, Alarm[]>()

/**
 * How long to wait before asking again while something is still PROCESSING.
 *
 * Long enough not to hammer the database for a list nobody is watching
 * closely, short enough that a reviewer who just accepted sees the alarms
 * their own decision fired.
 */
const PENDING_RETRY_MS = 15_000

/**
 * How many times to re-ask before giving up.
 *
 * bbaker has never seen an alarm hang in PROCESSING, but if one does that is
 * a problem for somebody else, and polling forever would only hide it. After
 * this the panel stops asking and says so.
 */
const PENDING_ATTEMPTS = 5

/**
 * How long after accepting or cancelling to re-read.
 *
 * The decision issues alarms of its own. They usually - not always - appear
 * as new rows, and not instantly, so one delayed read catches the common case
 * without pretending to be live.
 */
export const POST_ACTION_REFRESH_MS = 6_000

interface Held {
  /** Which event the rows belong to, so a stale set is recognisable. */
  id: number | undefined
  alarms: Alarm[]
}

/**
 * What the system has already done about this event.
 *
 * Fetched when the review opens rather than when the Summary step is looked
 * at: the answer feeds the cancel confirmation, which has to know whether
 * anything has gone out before the reviewer commits.
 */
export function useAlarms(eventId: number | undefined) {
  const { getToken, expireSession } = useAuth()
  const [held, setHeld] = useState<Held>(() => ({
    id: eventId,
    alarms: eventId === undefined ? [] : (cache.get(eventId) ?? []),
  }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Retries spent on the current pending run. State, not a ref: it is read
      during render to decide whether asking again has been given up on. */
  const [attempts, setAttempts] = useState(0)
  const inFlight = useRef<AbortController | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(
    async (id: number) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller
      setLoading(true)
      setError(null)
      try {
        const rows = await apiGet<RawAlarm[]>(`/events/${id}/alarms`, getToken(), controller.signal)
        if (controller.signal.aborted) return
        const parsed = parseAlarms(rows)
        cache.set(id, parsed)
        setHeld({ id, alarms: parsed })
        // Settled: the next pending run starts its count afresh.
        if (!hasPending(parsed)) setAttempts(0)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        /*
          Said out loud rather than shown as an empty list: "no alarms" and
          "could not read the alarms" mean opposite things to someone about to
          cancel an event.
        */
        setError('Could not read the alarm actions.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [getToken, expireSession],
  )

  /*
    Switching events is resolved during render, as in useWaveforms: setting
    state from the effect body to catch up with a changed prop shows the
    previous event's alarms for a frame first.
  */
  const alarms = useMemo(
    () =>
      held.id === eventId
        ? held.alarms
        : eventId === undefined
          ? []
          : (cache.get(eventId) ?? []),
    [held, eventId],
  )

  useEffect(() => {
    if (eventId === undefined || cache.has(eventId)) return
    const start = window.setTimeout(() => void load(eventId), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [eventId, load])

  /*
    Something still running means the list is not final, so ask again - a
    bounded number of times.

    Scheduled from an effect rather than from inside `load`, which would
    otherwise have to reference itself.
  */
  useEffect(() => {
    if (eventId === undefined || !hasPending(alarms) || attempts >= PENDING_ATTEMPTS) return
    const retry = window.setTimeout(() => {
      setAttempts((spent) => spent + 1)
      void load(eventId)
    }, PENDING_RETRY_MS)
    return () => window.clearTimeout(retry)
  }, [alarms, attempts, eventId, load])

  // Nothing should keep polling once the page is gone.
  useEffect(() => () => window.clearTimeout(timer.current), [])

  /**
   * Re-read after a delay, once an action has been taken.
   *
   * The cache is dropped first: the held rows are the ones from before the
   * decision, and seeing what it changed is the entire point.
   */
  const refreshAfter = useCallback(
    (delayMs: number) => {
      if (eventId === undefined) return
      window.clearTimeout(timer.current)
      setAttempts(0)
      cache.delete(eventId)
      timer.current = window.setTimeout(() => void load(eventId), delayMs)
    },
    [eventId, load],
  )

  return {
    alarms,
    loading,
    error,
    /** Still pending after the retries ran out - stuck, not slow. */
    gaveUp: hasPending(alarms) && attempts >= PENDING_ATTEMPTS,
    refreshAfter,
  }
}
