import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { fetchAppSettings, type AppSettings } from '../settings/appSettings'
import {
  fetchStations,
  indexStationEpochs,
  indexStations,
  parseStations,
  type Station,
} from './stations'

/**
 * Station metadata and app settings, fetched once per session.
 *
 * Both are effectively static - a station's coordinates and the map key do
 * not change while somebody is looking at an event - so they are cached at
 * module level and shared by every consumer rather than re-fetched per page.
 */
let stationCache: Map<string, Station> | null = null
/** Every epoch, for placing an observation at the time it happened. */
let epochCache: Map<string, Station[]> | null = null
let settingsCache: AppSettings | null = null

export function useStationsAndSettings() {
  const { getToken, expireSession } = useAuth()
  const [stations, setStations] = useState<Map<string, Station>>(
    () => stationCache ?? new Map(),
  )
  const [epochs, setEpochs] = useState<Map<string, Station[]>>(
    () => epochCache ?? new Map(),
  )
  const [settings, setSettings] = useState<AppSettings | null>(() => settingsCache)
  const [loading, setLoading] = useState(stationCache === null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (stationCache !== null && settingsCache !== null) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    try {
      const [rows, appSettings] = await Promise.all([
        stationCache === null
          ? fetchStations(getToken(), controller.signal)
          : Promise.resolve(null),
        settingsCache === null
          ? fetchAppSettings(getToken(), controller.signal)
          : Promise.resolve(null),
      ])
      if (controller.signal.aborted) return
      if (rows !== null) {
        const parsed = parseStations(rows)
        stationCache = indexStations(parsed)
        epochCache = indexStationEpochs(parsed)
        setStations(stationCache)
        setEpochs(epochCache)
      }
      if (appSettings !== null) {
        settingsCache = appSettings
        setSettings(appSettings)
      }
      setLoading(false)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (cause instanceof ApiError && cause.isUnauthorized) {
        expireSession()
        return
      }
      setLoading(false)
      // Non-fatal: the arrivals table works without a map, so this only
      // suppresses the map rather than failing the page.
      setError(
        cause instanceof ApiError ? cause.message : 'Could not load station information.',
      )
    }
  }, [getToken, expireSession])

  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [load])

  return { stations, epochs, settings, loading, error }
}
