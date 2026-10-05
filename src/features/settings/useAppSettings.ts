import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { cachedAppSettings, loadAppSettings, type AppSettings } from './appSettings'

/**
 * The app settings on their own, for places that need nothing else.
 *
 * Null until loaded, and stays null if the request fails: everything that
 * reads them treats a missing setting as "not configured" and hides the
 * thing that would have used it.
 */
export function useAppSettings(): AppSettings | null {
  const { getToken, expireSession } = useAuth()
  const [settings, setSettings] = useState<AppSettings | null>(cachedAppSettings)

  useEffect(() => {
    if (settings !== null) return
    let live = true
    const start = window.setTimeout(() => {
      loadAppSettings(getToken())
        .then((loaded) => {
          if (live) setSettings(loaded)
        })
        .catch((cause) => {
          if (cause instanceof ApiError && cause.isUnauthorized) expireSession()
        })
    }, 0)
    return () => {
      live = false
      window.clearTimeout(start)
    }
  }, [settings, getToken, expireSession])

  return settings
}
