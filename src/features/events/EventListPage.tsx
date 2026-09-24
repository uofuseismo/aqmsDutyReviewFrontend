import { Heading, Alert, Box, Button, HStack, Spinner, Stack, Text } from '@chakra-ui/react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { EventList } from './EventList'
import { EventSearch } from './EventSearch'
import { filterEvents } from './filterEvents'
import { formatLocalTimeOnly } from './format'
import { useCatalog } from './useCatalog'

/** How long a manual refresh's "No changes" / "Updated" stays up. */
const REFRESH_RESULT_MS = 4_000

/** A catalog read this recently is fresh enough to skip the arrival re-check. */
const LIST_RECHECK_AFTER_MS = 5_000

export function EventListPage() {
  const { events, loading, error, fetchedAt, hash, reload, revalidate } = useCatalog()

  /*
    Re-check on arriving back at the list.

    The backend drops its catalog cache after an accept or cancel, so the
    next read reflects the decision - but the next read used to be the
    two-minute poll. Coming back from a review is exactly when the list is
    most likely to be out of date, so ask then. Quiet, and cheap when
    nothing moved: the hash matches and not a row re-renders.

    Skipped while a load is already in flight, or if the catalog was read in
    the last few seconds - which covers opening the app, and the Summary's
    own re-read straight after an action.
  */
  useEffect(() => {
    if (loading || events.length === 0) return
    if (fetchedAt !== null && Date.now() - fetchedAt.getTime() < LIST_RECHECK_AFTER_MS) return
    const start = window.setTimeout(revalidate, 0)
    return () => window.clearTimeout(start)
    // Once per arrival: re-running on every poll would be the poll twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revalidate])

  /*
    What a press of Refresh found.

    It always did re-read - but when nothing has changed the backend answers
    from its cache in milliseconds, the spinner flashes too fast to see, and
    the only trace was the seconds ticking over in a muted timestamp. The
    first real cancel met exactly that: AQMS had not yet deselected the
    event, so there was nothing new to show, and Refresh looked ignored.
    Now it says which: the catalog hash before and after decides.
  */
  const [manual, setManual] = useState<{ at: number; hashBefore: string | null } | null>(null)
  const refreshResult =
    manual !== null && !loading && fetchedAt !== null && fetchedAt.getTime() >= manual.at
      ? hash === manual.hashBefore
        ? 'No changes'
        : 'Updated'
      : null
  useEffect(() => {
    if (refreshResult === null) return
    const clear = window.setTimeout(() => setManual(null), REFRESH_RESULT_MS)
    return () => window.clearTimeout(clear)
  }, [refreshResult])
  const [query, setQuery] = useState('')

  /*
    The box updates on every keystroke; the list is allowed to lag a frame
    behind it. Without this, re-filtering and re-rendering several hundred
    rows happens inside the keystroke itself and the typing feels like it is
    dragging - the characters appear late rather than the list appearing late.
  */
  const deferredQuery = useDeferredValue(query)

  // Filtering happens here so the header can report what is being shown;
  // sorting stays inside the list and is unaffected by it.
  const visible = useMemo(
    () => filterEvents(events, deferredQuery),
    [events, deferredQuery],
  )
  const filtering = deferredQuery.trim() !== ''

  return (
    <Stack gap="4">
      <HStack justify="space-between" align="center" wrap="wrap" gap="2">
        <HStack gap="3" align="baseline">
          {/* The page's h1. It looked like a heading already; now it is one,
              so heading navigation lands somewhere useful. */}
          <Heading as="h1" size="lg" fontWeight="semibold">
            Events
          </Heading>
          {!loading && !error && (
            <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
              {filtering
                ? `${visible.length} of ${events.length}`
                : `${events.length} in the catalog`}
              {fetchedAt && ` · updated ${formatLocalTimeOnly(fetchedAt)}`}
            </Text>
          )}
        </HStack>
        <HStack gap="2" flex={{ base: '1 1 100%', sm: '0 0 auto' }}>
          <EventSearch value={query} onChange={setQuery} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setManual({ at: Date.now(), hashBefore: hash })
              void reload()
            }}
            loading={loading && events.length > 0}
          >
            <LuRefreshCw /> Refresh
          </Button>
          {/* Polite: an answer to something the reader just did, not news. */}
          <Text fontSize="sm" color="fg.muted" aria-live="polite" minW="5.5rem" whiteSpace="nowrap">
            {refreshResult}
          </Text>
        </HStack>
      </HStack>

      {error && (
        <Alert.Root status="error" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {loading && events.length === 0 ? (
        <HStack gap="3" py="10" justify="center" color="fg.muted">
          <Spinner size="sm" />
          <Text>Loading the catalog…</Text>
        </HStack>
      ) : visible.length === 0 && !error ? (
        <Box py="10" textAlign="center" color="fg.muted">
          <Text>
            {filtering
              ? `No event identifier matches “${deferredQuery.trim()}”.`
              : 'No events in the catalog window.'}
          </Text>
        </Box>
      ) : (
        <Box borderWidth="1px" rounded="lg" overflow="hidden" bg="bg.panel">
          <EventList events={visible} />
        </Box>
      )}
    </Stack>
  )
}
