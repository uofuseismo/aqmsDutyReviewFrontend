import { Badge, Box, HStack, Link, Stack, Table, Text } from '@chakra-ui/react'
import { memo, useMemo, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuChevronRight } from 'react-icons/lu'
import { Link as RouterLink } from 'react-router'
import { useIsWideScreen } from '../../hooks/useMediaQuery'
import { LockBadge } from './LockBadge'
import { useLocks } from './useLocks'
import type { EventLock } from './locks'
import {
  formatLatitude,
  formatLongitude,
  formatMagnitude,
  formatUtc,
  magnitudeLabel,
  reviewStatusPalette,
  humanize,
} from './format'
import { DEFAULT_SORT, sortEvents, type Sort, type SortKey } from './sortEvents'
import type { CatalogEvent } from './types'

interface ColumnSpec {
  key: SortKey
  label: string
  numeric?: boolean
}

/**
 * Column order is deliberate: magnitude sits third, immediately after the
 * identifier and time. It is usually the reason an analyst was woken up, so
 * it belongs where the eye lands rather than buried past the coordinates.
 */
const COLUMNS: ColumnSpec[] = [
  { key: 'id', label: 'Event', numeric: true },
  { key: 'time', label: 'Origin time (UTC)' },
  { key: 'magnitude', label: 'Magnitude', numeric: true },
  { key: 'latitude', label: 'Latitude', numeric: true },
  { key: 'longitude', label: 'Longitude', numeric: true },
  { key: 'eventType', label: 'Type' },
  { key: 'geographicType', label: 'Region' },
  { key: 'reviewStatus', label: 'Status' },
]

function MagnitudeCell({ event }: { event: CatalogEvent }) {
  if (event.magnitude === undefined) {
    return (
      <Text as="span" color="fg.muted" aria-label="No magnitude">
        —
      </Text>
    )
  }
  return (
    <HStack gap="1.5" justify="flex-end">
      <Text as="span" fontWeight="semibold" fontVariantNumeric="tabular-nums">
        {formatMagnitude(event.magnitude)}
      </Text>
      <Text as="span" color="fg.muted" fontSize="xs">
        {magnitudeLabel(event.magnitudeType)}
      </Text>
    </HStack>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge colorPalette={reviewStatusPalette(status)} variant="subtle" size="sm">
      {humanize(status)}
    </Badge>
  )
}


/**
 * Memoised because filtering re-renders the list on every keystroke. The
 * parsed event objects keep their identity across a filter change, so the
 * rows that survive the filter skip re-rendering entirely instead of
 * rebuilding several hundred badges and cells.
 */
const EventTableRow = memo(function EventTableRow({
  event,
  lock,
}: {
  event: CatalogEvent
  lock?: EventLock
}) {
  return (
    <Table.Row>
      <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
        <Link
          asChild
          variant="underline"
          color="utahRed.fg"
          fontWeight="medium"
          textUnderlineOffset="3px"
        >
          <RouterLink to={`/events/${event.id}`}>{event.id}</RouterLink>
        </Link>
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap" fontVariantNumeric="tabular-nums">
        {formatUtc(event.time)}
      </Table.Cell>
      <Table.Cell textAlign="end">
        <MagnitudeCell event={event} />
      </Table.Cell>
      <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
        {event.hasLocation ? formatLatitude(event.latitude) : '—'}
      </Table.Cell>
      <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
        {event.hasLocation ? formatLongitude(event.longitude) : '—'}
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">{humanize(event.eventType)}</Table.Cell>
      <Table.Cell whiteSpace="nowrap">{humanize(event.geographicType) || '—'}</Table.Cell>
      <Table.Cell>
        <HStack gap="1.5">
          <StatusBadge status={event.reviewStatus} />
          {lock && <LockBadge lock={lock} />}
        </HStack>
      </Table.Cell>
    </Table.Row>
  )
})

/** The wide layout: a real table, sortable by every column. */
function EventTable({
  events,
  sort,
  onSort,
  locks,
}: {
  events: CatalogEvent[]
  sort: Sort
  onSort: (key: SortKey) => void
  locks: Map<number, EventLock>
}) {
  return (
    <Table.Root size="sm" interactive stickyHeader>
      <Table.Header>
        <Table.Row bg="bg.panel">
          {COLUMNS.map((column) => {
            const active = sort.key === column.key
            return (
              <Table.ColumnHeader
                key={column.key}
                textAlign={column.numeric ? 'end' : 'start'}
                whiteSpace="nowrap"
                // Announces the sort state instead of leaving it to the icon.
                aria-sort={
                  active
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <Box
                  asChild
                  display="inline-flex"
                  alignItems="center"
                  gap="1"
                  fontWeight="semibold"
                  cursor="pointer"
                  color={active ? 'fg' : 'fg.muted'}
                  _hover={{ color: 'fg' }}
                >
                  <button type="button" onClick={() => onSort(column.key)}>
                    {column.label}
                    {active &&
                      (sort.direction === 'asc' ? (
                        <LuArrowUp aria-hidden />
                      ) : (
                        <LuArrowDown aria-hidden />
                      ))}
                  </button>
                </Box>
              </Table.ColumnHeader>
            )
          })}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {events.map((event) => (
          <EventTableRow key={event.id} event={event} lock={locks.get(event.id)} />
        ))}
      </Table.Body>
    </Table.Root>
  )
}


const EventCardRow = memo(function EventCardRow({
  event,
  lock,
}: {
  event: CatalogEvent
  lock?: EventLock
}) {
  return (
    <Box
      asChild
      px="3"
      py="3"
      _hover={{ bg: 'bg.subtle' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'utahRed.focusRing' }}
    >
      <RouterLink to={`/events/${event.id}`}>
        <HStack gap="3" align="flex-start">
          <Stack gap="1" flex="1" minW="0">
            <HStack gap="2" justify="space-between">
              <Text fontWeight="semibold" fontVariantNumeric="tabular-nums">
                {event.id}
              </Text>
              <MagnitudeCell event={event} />
            </HStack>
            <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
              {formatUtc(event.time)} UTC
            </Text>
            <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
              {event.hasLocation
                ? `${formatLatitude(event.latitude)}, ${formatLongitude(event.longitude)}`
                : 'No location'}
            </Text>
            <HStack gap="2" pt="0.5" wrap="wrap">
              <StatusBadge status={event.reviewStatus} />
              <Badge variant="outline" size="sm">
                {humanize(event.eventType)}
              </Badge>
              {event.geographicType !== undefined && (
                <Badge variant="outline" size="sm">
                  {humanize(event.geographicType)}
                </Badge>
              )}
              {lock && <LockBadge lock={lock} />}
            </HStack>
          </Stack>
          <Box color="fg.muted" pt="1" aria-hidden>
            <LuChevronRight />
          </Box>
        </HStack>
      </RouterLink>
    </Box>
  )
})

/**
 * The narrow layout.
 *
 * Eight columns will not fit a phone, and a table that scrolls sideways hides
 * exactly the fields being scanned for. Each event becomes a tappable row of
 * three lines instead, carrying the same eight fields, with the two an
 * analyst scans first - magnitude and status - on the outside edges where the
 * eye lands.
 */
function EventRows({
  events,
  locks,
}: {
  events: CatalogEvent[]
  locks: Map<number, EventLock>
}) {
  return (
    <Stack gap="0" separator={<Box borderBottomWidth="1px" />}>
      {events.map((event) => (
        <EventCardRow key={event.id} event={event} lock={locks.get(event.id)} />
      ))}
    </Stack>
  )
}

export function EventList({ events }: { events: CatalogEvent[] }) {
  const isWide = useIsWideScreen()
  const { locks } = useLocks()
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const sorted = useMemo(() => sortEvents(events, sort), [events, sort])

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : // A new column starts descending: for time and magnitude alike,
          // the interesting end is the big one.
          { key, direction: 'desc' },
    )
  }

  /*
    One layout at a time, chosen in JS rather than hidden with CSS.
    Rendering both and hiding one still costs a full reconcile of every row in
    the hidden tree - about 1300 row components on this catalog - which is
    paid again on every keystroke in the filter box.
  */
  return isWide ? (
    <EventTable events={sorted} sort={sort} onSort={toggleSort} locks={locks} />
  ) : (
    <EventRows events={sorted} locks={locks} />
  )
}
