import {
  Alert,
  Badge,
  Box,
  Collapsible,
  HStack,
  Icon,
  Spinner,
  Stack,
  Table,
  Tabs,
  Text,
} from '@chakra-ui/react'
import {
  LuBan,
  LuCheck,
  LuChevronDown,
  LuCircleHelp,
  LuClock,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu'
import { Tooltip } from '../../components/ui/Tooltip'
import { useIsMediumScreen } from '../../hooks/useMediaQuery'
import { formatLocalDateTime, localZoneAbbreviation } from '../events/format'
import { alarmGlyph, alarmSources, summariseAlarms, type Alarm } from './alarms'

/**
 * What the system has already done about this event.
 *
 * A headline, always; the fifteen rows only when asked for. The list is not
 * what a reviewer needs at the moment of deciding - "everything went out, one
 * delivery failed" is - and fifteen rows would push the decision itself off
 * the screen we just spent the effort to fit.
 *
 * Failures are named in the headline. An alarm that did not complete is the
 * only row anybody has to act on.
 */
export function AlarmsPanel({
  alarms,
  loading,
  error,
  stuck = false,
}: {
  alarms: Alarm[]
  loading: boolean
  error: string | null
  /** Still PROCESSING after the retries ran out. */
  stuck?: boolean
}) {
  const summary = summariseAlarms(alarms)
  const sources = alarmSources(alarms)
  /*
    Rev is the first thing to go on a narrow screen: it is "—" on almost every
    row, and the rows that do carry a number are saying the alarm ran twice
    for a revised solution - context, not a thing to act on. Source goes too,
    but into the tabs rather than away.
  */
  const wide = useIsMediumScreen()

  if (error !== null) {
    return (
      <Alert.Root status="warning" size="sm" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    )
  }

  if (loading && alarms.length === 0) {
    return (
      <HStack gap="2" color="fg.muted" fontSize="sm">
        <Spinner size="xs" />
        <Text>Reading alarm actions…</Text>
      </HStack>
    )
  }

  if (alarms.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No alarm actions - nothing has gone out for this event.
      </Text>
    )
  }

  return (
    <Collapsible.Root>
      <Stack gap="2">
        {/* The trigger is a real button, with the row as its content - asChild
            on an HStack would put button props on a div. */}
        <Collapsible.Trigger asChild>
          <Box
            asChild
            textAlign="start"
            _hover={{ color: 'fg' }}
            color="fg.muted"
            fontSize="sm"
            width="fit-content"
          >
            <button type="button">
              <HStack gap="2">
            <Icon size="sm" aria-hidden>
              <LuChevronDown />
            </Icon>
            <Text>
              {summary.total} alarm {summary.total === 1 ? 'action' : 'actions'} across{' '}
              {summary.distinctActions} {summary.distinctActions === 1 ? 'channel' : 'channels'}
            </Text>
                {summary.failed > 0 && (
                  <Badge size="sm" variant="subtle" colorPalette="red">
                    {summary.failed} failed
                  </Badge>
                )}
                {/* Neutral, not red: after a cancel this is every row, and
                    it is the decision working rather than anything wrong. */}
                {summary.cancelled > 0 && (
                  <Badge size="sm" variant="subtle" colorPalette="gray">
                    {summary.cancelled === summary.total ? 'all' : summary.cancelled} cancelled
                  </Badge>
                )}
              </HStack>
            </button>
          </Box>
        </Collapsible.Trigger>

        {/* Stuck is not the same as failed: the alarm has not come back, and
            nobody here has ever seen that happen. Said plainly rather than
            left as a spinner that never stops. */}
        {stuck && (
          <HStack gap="1.5" color="warningText" fontSize="sm">
            <Icon size="xs" aria-hidden>
              <LuTriangleAlert />
            </Icon>
            <Text>
              {summary.pending} still processing after several checks - no longer asking.
            </Text>
          </HStack>
        )}

        {/* The failure, out where it cannot be missed. Everything else waits
            behind the disclosure. */}
        {summary.failures.map((alarm) => (
          <HStack key={`${alarm.action}:${alarm.timeMs}`} gap="1.5" color="attentionText" fontSize="sm">
            <Icon size="xs" aria-hidden>
              <LuTriangleAlert />
            </Icon>
            <Text>
              <strong>{alarm.action}</strong> ended in {alarm.state} at{' '}
              {formatLocalDateTime(alarm.time)} {localZoneAbbreviation()}
            </Text>
          </HStack>
        ))}

        <Collapsible.Content>
          {/* One source, no tabs: a tab strip with a single tab is furniture. */}
          {sources.length <= 1 ? (
            <AlarmTable rows={alarms} wide={wide} />
          ) : (
            <Tabs.Root defaultValue={sources[0]} variant="enclosed" size="sm">
              <Tabs.List>
                {sources.map((source) => {
                  const rows = alarms.filter((alarm) => alarm.database === source)
                  const failed = rows.filter((alarm) => alarm.failed).length
                  return (
                    <Tabs.Trigger key={source} value={source}>
                      {source}
                      <Text as="span" color="fg.muted" fontSize="xs">
                        {rows.length}
                      </Text>
                      {/* The count of failures on the tab itself, so a source
                          with a problem is visible without opening it. */}
                      {failed > 0 && (
                        <Badge size="sm" variant="subtle" colorPalette="red">
                          {failed}
                        </Badge>
                      )}
                    </Tabs.Trigger>
                  )
                })}
              </Tabs.List>
              {sources.map((source) => (
                <Tabs.Content key={source} value={source} pt="2">
                  <AlarmTable
                    rows={alarms.filter((alarm) => alarm.database === source)}
                    wide={wide}
                  />
                </Tabs.Content>
              ))}
            </Tabs.Root>
          )}
        </Collapsible.Content>
      </Stack>
    </Collapsible.Root>
  )
}

/** The rows for one source. Source itself is the tab, so it is not a column. */
function AlarmTable({ rows, wide }: { rows: Alarm[]; wide: boolean }) {
  return (
    <Box borderWidth="1px" rounded="md" overflow="hidden" overflowX="auto">
      <Table.Root size="sm" interactive stickyHeader>
        <Table.Header>
          <Table.Row bg="bg.panel">
            <Table.ColumnHeader>Action</Table.ColumnHeader>
            <Table.ColumnHeader width="1" textAlign="center">
              State
            </Table.ColumnHeader>
            {wide && <Table.ColumnHeader textAlign="end">Rev</Table.ColumnHeader>}
            <Table.ColumnHeader whiteSpace="nowrap">
              When ({localZoneAbbreviation()})
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((alarm) => (
            <Table.Row
              key={`${alarm.database}:${alarm.action}:${alarm.modificationCount}:${alarm.timeMs}`}
            >
              <Table.Cell fontFamily="mono" fontSize="xs" whiteSpace="nowrap">
                {alarm.action}
              </Table.Cell>
              <Table.Cell textAlign="center">
                <StateMark alarm={alarm} />
              </Table.Cell>
              {wide && (
                <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
                  {/* Only interesting when it is not 1: a second run means the
                      solution changed and the alarm went again. */}
                  {alarm.modificationCount === 1 ? '—' : alarm.modificationCount}
                </Table.Cell>
              )}
              <Table.Cell whiteSpace="nowrap" fontVariantNumeric="tabular-nums">
                {formatLocalDateTime(alarm.time)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}

const GLYPHS = {
  check: { icon: <LuCheck />, color: undefined as string | undefined },
  clock: { icon: <LuClock />, color: 'warningText' },
  // Muted like a completed row: withdrawn on purpose, nothing to act on.
  cancelled: { icon: <LuBan />, color: undefined as string | undefined },
  cross: { icon: <LuX />, color: 'attentionText' },
  unknown: { icon: <LuCircleHelp />, color: 'attentionText' },
} as const

/**
 * The state as one glyph, with the word in the tooltip and the accessible
 * name.
 *
 * Nothing is lost: the exact string the database sent is still readable, it
 * is simply not repeated fourteen times across the widest column in the
 * table.
 */
function StateMark({ alarm }: { alarm: Alarm }) {
  const glyph = GLYPHS[alarmGlyph(alarm)]
  return (
    <Tooltip content={alarm.state}>
      <Icon
        size="sm"
        color={glyph.color ?? 'fg.muted'}
        aria-label={`${alarm.action}: ${alarm.state}`}
      >
        {glyph.icon}
      </Icon>
    </Tooltip>
  )
}
