import { useEffect, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { parseContacts, type Contact, type ContactLink, type RawContacts } from './contacts'

interface Held {
  contacts: Contact[]
  links: ContactLink[]
}

/*
  Kept for the session, but re-read on every visit to the page.

  The list changes rarely, so whatever was read last is shown at once - a
  number you need is no further away than the page - and confirmed in the
  background. Only in memory: these are people's phone numbers, and they have
  no business in browser storage.
*/
let cache: Held | null = null

export function useContacts() {
  const { getToken, expireSession } = useAuth()
  const [held, setHeld] = useState<Held | null>(cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const start = window.setTimeout(async () => {
      try {
        const raw = await apiGet<RawContacts>('/contacts', getToken(), controller.signal)
        if (controller.signal.aborted) return
        cache = parseContacts(raw)
        setHeld(cache)
        setError(null)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        // With a list already on screen, a failed refresh is not worth a
        // banner over it; with nothing to show, it is the whole story.
        setError(cause instanceof ApiError ? cause.message : 'Could not load the contact list.')
      }
    }, 0)
    return () => {
      window.clearTimeout(start)
      controller.abort()
    }
  }, [getToken, expireSession])

  return {
    contacts: held?.contacts ?? [],
    links: held?.links ?? [],
    loading: held === null && error === null,
    error: held === null ? error : null,
  }
}
