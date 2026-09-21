import { Badge, Box, HStack, Icon, Table, Text } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuTriangleAlert } from 'react-icons/lu'
import { useIsMediumScreen } from '../../hooks/useMediaQuery'
import { Tooltip } from '../../components/ui/Tooltip'
import { formatUtcTimeOnly } from './format'
import { ARRIVAL_RESIDUAL_THRESHOLDS, arrivalResidualLevel, type Arrival } from './eventDetail'
import { GeometryValue } from './GeometryValue'
import { ResidualValue } from './ResidualValue'

type Key =
  | 'distanceKm'
  | 'station'
  | 'phase'
  | 'timeMs'
  | 'residualSeconds'
  | 'quality'
  | 'azimuthDegrees'

interface Column {
  key: Key
  label: string
  numeric?: boolean
  /** Narrow screens keep only the four that decide whether a pick is sound. */
  essential?: boolean
  /** First to go when the table is in a column rather than across the page. */
  droppable?: boolean
}

/**
 * How much room the table has been given.
 *
 *  - `full`     every column; the table has the page to itself
 *  - `compact`  drops the arrival time; enough for a half-width pane
 *  - `essential` the four that answer "is this pick sound?"; a phone
 *
 * A width is measured in columns, not pixels, because the parent knows what
 * it handed over and the table does not.
 */
export type ArrivalsDensity = 'full' | 'compact' | 'essential'

/**
 * Column order is distance-first because that is how a pick list is read:
 * nearest station at the top, since it is the one constraining depth.
 *
 * `essential` marks what survives on a phone. Seven columns of numbers do not
 * fit a 390px screen, and a table that scrolls sideways hides exactly the
 * column being scanned. Distance, station, phase and residual are what answer
 * "is this pick sound?"; arrival time, quality and azimuth are detail for a
 * wider screen.
 */
const COLUMNS: Column[] = [
  { key: 'distanceKm', label: 'Dist (km)', numeric: true, essential: true },
  { key: 'station', label: 'Station', essential: true },
  { key: 'phase', label: 'Phase', essential: true },
  { key: 'residualSeconds', label: 'Residual (s)', numeric: true, essential: true },
  { key: 'quality', label: 'Quality', numeric: true },
  { key: 'azimuthDegrees', label: 'Az (°)', numeric: true },
  // Last, and the first dropped: the absolute clock time answers "when did
  // this arrive" far less often than the residual answers "is this pick
  // sound". Being last is what makes it the one to lose.
  { key: 'timeMs', label: 'Arrival (UTC)', droppable: true },
]

function ResidualCell({ arrival }: { arrival: Arrival }) {
  return (
    <ResidualValue
      level={arrivalResidualLevel(arrival)}
      value={`${arrival.residualSeconds >= 0 ? '+' : ''}${arrival.residualSeconds.toFixed(3)}`}
      unit="s"
      thresholds={ARRIVAL_RESIDUAL_THRESHOLDS}
    />
  )
}

export function ArrivalsTable({
  arrivals,
  fillHeight = false,
  density,
}: {
  arrivals: Arrival[]
  /**
   * Fill the parent's height, scrolling the rows and pinning the summary.
   *
   * Used by the split layout, where the table shares a fixed-height row with
   * the map and has to scroll inside its own half rather than growing the
   * page.
   */
  fillHeight?: boolean
  /**
   * How many columns the parent can actually afford.
   *
   * Left unset, the table asks how wide the WINDOW is - which stops being the
   * right question the moment it lives in a column rather than across the
   * page. The parent knows what it handed over; the viewport does not.
   */
  density?: ArrivalsDensity
}) {
  const isMediumViewport = useIsMediumScreen()
  const resolved: ArrivalsDensity =
    density ?? (isMediumViewport ? 'full' : 'essential')
  const [sort, setSort] = useState<{ key: Key; asc: boolean }>({
    key: 'distanceKm',
    asc: true,
  })

  const columns = useMemo(() => {
    if (resolved === 'essential') return COLUMNS.filter((c) => c.essential)
    if (resolved === 'compact') return COLUMNS.filter((c) => !c.droppable)
    return COLUMNS
  }, [resolved])
  const showTime = resolved === 'full'
  const showDetail = resolved !== 'essential'

  const sorted = useMemo(() => {
    const factor = sort.asc ? 1 : -1
    return [...arrivals].sort((a, b) => {
      const av: number | string | undefined = a[sort.key]
      const bv: number | string | undefined = b[sort.key]
      // An arrival with no geometry sinks to the bottom in both directions:
      // a blank is not "nearest", and a screen of dashes is no answer to
      // "show me the closest station".
      if (av === undefined && bv === undefined) return a.station.localeCompare(b.station)
      if (av === undefined) return 1
      if (bv === undefined) return -1
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return cmp !== 0 ? cmp * factor : (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
    })
  }, [arrivals, sort])

  if (arrivals.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm" py="6" textAlign="center">
        This origin has no arrivals.
      </Text>
    )
  }

  // Counted per level: "3 flagged" hid whether any of them were alerts.
  const levels = arrivals.map((a) => arrivalResidualLevel(a))
  const alerts = levels.filter((level) => level === 'alert').length
  const warnings = levels.filter((level) => level === 'warning').length
  const flagged = alerts + warnings

  return (
    <Box
      display={fillHeight ? 'flex' : undefined}
      flexDirection={fillHeight ? 'column' : undefined}
      height={fillHeight ? '100%' : undefined}
      minH="0"
    >
      {/* overflowX so a column set that still does not fit scrolls rather
          than being silently cut off at the edge of the pane. */}
      <Box
        flex={fillHeight ? '1' : undefined}
        overflowY={fillHeight ? 'auto' : undefined}
        overflowX="auto"
        minH="0"
      >
      <Table.Root size="sm" interactive stickyHeader>
        <Table.Header>
          <Table.Row bg="bg.panel">
            {columns.map((column) => {
              const active = sort.key === column.key
              return (
                <Table.ColumnHeader
                  key={column.key}
                  textAlign={column.numeric ? 'end' : 'start'}
                  whiteSpace="nowrap"
                  px={{ base: '2', md: '3' }}
                  aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'}
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
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) =>
                          s.key === column.key
                            ? { key: column.key, asc: !s.asc }
                            : { key: column.key, asc: true },
                        )
                      }
                    >
                      {column.label}
                      {active &&
                        (sort.asc ? <LuArrowUp aria-hidden /> : <LuArrowDown aria-hidden />)}
                    </button>
                  </Box>
                </Table.ColumnHeader>
              )
            })}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sorted.map((arrival) => (
            <Table.Row key={arrival.id}>
              <Table.Cell
                textAlign="end"
                fontVariantNumeric="tabular-nums"
                px={{ base: '2', md: '3' }}
              >
                <GeometryValue
                  value={arrival.distanceKm}
                  source={arrival.geometrySource}
                  format={(v) => v.toFixed(1)}
                />
              </Table.Cell>
              <Table.Cell whiteSpace="nowrap" px={{ base: '2', md: '3' }}>
                {showDetail ? (
                  /* One string, not a name repeated beside its own stream id.
                     The station is the part the eye looks for, so it carries
                     the weight while the rest stays quiet around it. */
                  <Text fontFamily="mono" fontSize="sm" color="fg.muted">
                    {arrival.network}.
                    <Text as="span" fontWeight="bold" color="fg">
                      {arrival.station}
                    </Text>
                    .{arrival.channel}.{arrival.locationCode}
                  </Text>
                ) : (
                  <Tooltip content={arrival.streamId}>
                    <Text fontWeight="medium">{arrival.station}</Text>
                  </Tooltip>
                )}
              </Table.Cell>
              <Table.Cell px={{ base: '2', md: '3' }}>
                <Badge
                  size="sm"
                  variant="subtle"
                  colorPalette={arrival.phase.toUpperCase().startsWith('S') ? 'purple' : 'blue'}
                >
                  {arrival.phase}
                </Badge>
              </Table.Cell>
              <Table.Cell textAlign="end" px={{ base: '2', md: '3' }}>
                <ResidualCell arrival={arrival} />
              </Table.Cell>
              {showDetail && (
                <>
                  <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums" px="3">
                    {arrival.quality.toFixed(2)}
                  </Table.Cell>
                  <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums" px="3">
                    <GeometryValue
                      value={arrival.azimuthDegrees}
                      source={arrival.geometrySource}
                      format={(v) => v.toFixed(0)}
                    />
                  </Table.Cell>
                </>
              )}
              {showTime && (
                <Table.Cell whiteSpace="nowrap" fontVariantNumeric="tabular-nums" px="3">
                  {formatUtcTimeOnly(arrival.time)}
                  <Text as="span" color="fg.muted" fontSize="xs">
                    {' '}
                    +{arrival.travelTimeSeconds.toFixed(2)}s
                  </Text>
                </Table.Cell>
              )}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      </Box>
      <HStack
        gap="4"
        px="3"
        py="2"
        fontSize="xs"
        color="fg.muted"
        wrap="wrap"
        borderTopWidth={fillHeight ? '1px' : undefined}
        flexShrink="0"
      >
        <Text>{arrivals.length} arrivals</Text>
        <Text>
          {new Set(arrivals.map((a) => a.station)).size} stations,{' '}
          {arrivals.filter((a) => a.phase.toUpperCase().startsWith('S')).length} S
        </Text>
        {flagged > 0 && (
          <HStack gap="1" color={alerts > 0 ? 'attentionText' : 'warningText'}>
            <Icon size="xs" aria-hidden>
              <LuTriangleAlert />
            </Icon>
            <Text>
              {[
                alerts > 0 ? `${alerts} over ±${ARRIVAL_RESIDUAL_THRESHOLDS.alert}s` : null,
                warnings > 0 ? `${warnings} over ±${ARRIVAL_RESIDUAL_THRESHOLDS.warning}s` : null,
              ]
                .filter((part) => part !== null)
                .join(', ')}
            </Text>
          </HStack>
        )}
      </HStack>
    </Box>
  )
}
