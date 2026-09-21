import { Route, Routes, useParams } from 'react-router'
import { AppShell } from './components/AppShell'
import { LoginScreen } from './components/LoginScreen'
import { SessionSentinel } from './components/SessionSentinel'
import { useAuth } from './auth/useAuth'
import { CatalogProvider } from './features/events/CatalogProvider'
import { LocksProvider } from './features/events/LocksProvider'
import { EventListPage } from './features/events/EventListPage'
import { EventReviewPage } from './features/events/EventReviewPage'
import { NotFoundPage } from './components/NotFoundPage'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * The review page, reset per event.
 *
 * Keyed on the id so a failure on one event does not persist onto the next:
 * without it, an event whose payload breaks the page would leave every event
 * opened afterwards showing the same error.
 */
function ReviewRoute() {
  const { eventId } = useParams()
  return (
    <ErrorBoundary label="This event" resetKey={eventId}>
      <EventReviewPage />
    </ErrorBoundary>
  )
}

export default function App() {
  const { status } = useAuth()

  /**
   * Signed out, every address shows the login screen - and the address itself
   * is left alone. The token lives only in memory, so a refresh on
   * /events/31151766 lands here; keeping the URL means signing in puts the
   * reviewer back on that event rather than at the top of the list.
   */
  if (status === 'anonymous') {
    return <LoginScreen />
  }

  // `expired` still renders the app: the lock sits over it so the reviewer's
  // place - including their position in a review - survives signing back in.
  return (
    <>
      {/* Above the router: the catalog outlives any one page, so walking
          into an event and back does not re-fetch it. */}
      <CatalogProvider>
        <LocksProvider>
          <AppShell>
            {/* Inside the shell, not around it: a page that fails should still
                leave the header, the theme toggle and the account menu - and
                therefore the way back to the list - alive. */}
            <Routes>
              <Route
                path="/"
                element={
                  <ErrorBoundary label="The event list">
                    <EventListPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/events/:eventId" element={<ReviewRoute />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
        </LocksProvider>
      </CatalogProvider>
      <SessionSentinel />
    </>
  )
}
