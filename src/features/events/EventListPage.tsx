import { Heading, Alert, Box, Button, HStack, Spinner, Stack, Text } from '@chakra-ui/react'
import { useDeferredValue, useMemo, useState } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { EventList } from './EventList'
import { EventSearch } from './EventSearch'
import { filterEvents } from './filterEvents'
import { formatLocalTimeOnly } from './format'
import { useCatalog } from './useCatalog'

export function EventListPage() {
  const { events, loading, error, fetchedAt, reload } = useCatalog()
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
            onClick={() => void reload()}
            loading={loading && events.length > 0}
          >
            <LuRefreshCw /> Refresh
          </Button>
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
