import { Box, HStack, Icon, Table, Text } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuTriangleAlert } from 'react-icons/lu'
import { magnitudeLabel } from './format'
import { useIsMediumScreen } from '../../hooks/useMediaQuery'
import { Tooltip } from '../../components/ui/Tooltip'
import {
  MAGNITUDE_RESIDUAL_THRESHOLDS,
  magnitudeResidualLevel,
  type Magnitude,
  type StationMagnitude,
} from './eventDetail'
import { GeometryValue } from './GeometryValue'
import { ResidualValue } from './ResidualValue'

type Key = 'distanceKm' | 'station' | 'magnitude' | 'residual' | 'durationSeconds' | 'azimuthDegrees'

/**
 * Deliberately the same shape as the arrivals table: distance, then station,
 * then the values, then azimuth. An analyst moving between the Location and
 * Magnitude steps should not have to re-learn where to look.
 *
 * Coda appears only for magnitude types that measure one. Correction is
 * omitted entirely - it is always zero for a duration magnitude, and a column
 * of zeroes is a column of nothing.
 */
const COLUMNS: {
  key: Key
  label: string
  numeric?: boolean
  essential?: boolean
  codaOnly?: boolean
}[] = [
  { key: 'distanceKm', label: 'Dist (km)', numeric: true, essential: true },
  { key: 'station', label: 'Station', essential: true },
  { key: 'magnitude', label: 'Magnitude', numeric: true, essential: true },
  { key: 'residual', label: 'Residual', numeric: true, essential: true },
  { key: 'durationSeconds', label: 'Coda (s)', numeric: true, codaOnly: true },
  { key: 'azimuthDegrees', label: 'Az (°)', numeric: true },
]

function ResidualCell({ stationMagnitude }: { stationMagnitude: StationMagnitude }) {
  const residual = stationMagnitude.residual
  if (residual === undefined) {
    return <Text as="span">—</Text>
  }
  return (
    <ResidualValue
      level={magnitudeResidualLevel(stationMagnitude)}
      value={`${residual >= 0 ? '+' : ''}${residual.toFixed(2)}`}
      unit=""
      thresholds={MAGNITUDE_RESIDUAL_THRESHOLDS}
    />
  )
}

/**
 * The stations behind one network magnitude.
 *
 * A duration magnitude is an average over stations, and the average is only
 * as good as its worst contributor - so the question this answers is which
 * station is pulling it, not what the network value is. That is why the
 * residual leads rather than the station's own magnitude.
 */
export function StationMagnitudeTable({
  magnitude,
  fillHeight = false,
  density,
}: {
  magnitude: Magnitude
  /**
   * Fill the parent's height, scrolling the rows and pinning the summary.
   * Used by the split layout, where the table shares a fixed-height row with
   * the map.
   */
  fillHeight?: boolean
  /**
   * How many columns the parent can afford. Unset, the table asks the
   * viewport - which is the wrong question once it lives in a column rather
   * than across the page.
   */
  density?: 'full' | 'essential'
}) {
  const isMediumViewport = useIsMediumScreen()
  const isMedium = density === undefined ? isMediumViewport : density === 'full'
  // Nearest first, matching the arrivals table. The residual column is one
  // click away for anyone hunting outliers instead of reading by distance.
  const [sort, setSort] = useState<{ key: Key; asc: boolean }>({
    key: 'distanceKm',
    asc: true,
  })

  // Coda is meaningless for a magnitude that does not measure one, so the
  // column is decided by the data rather than by the magnitude's type string.
  const hasCoda = magnitude.stationMagnitudes.some((sm) => sm.durationSeconds !== undefined)
  const columns = useMemo(
    () =>
      COLUMNS.filter(
        (c) => (isMedium || c.essential) && (hasCoda || !c.codaOnly),
      ),
    [isMedium, hasCoda],
  )

  const sorted = useMemo(() => {
    const factor = sort.asc ? 1 : -1
    const value = (sm: StationMagnitude): number | string | undefined => {
      switch (sort.key) {
        case 'distanceKm':
          return sm.distanceKm
        case 'station':
          return sm.station
        case 'magnitude':
          return sm.magnitude
        // Ordered by SIZE of disagreement, not sign: a station 0.7 low is as
        // interesting as one 0.7 high.
        case 'residual':
          return sm.residual === undefined ? undefined : Math.abs(sm.residual)
        case 'durationSeconds':
          return sm.durationSeconds
        case 'azimuthDegrees':
          return sm.azimuthDegrees
      }
    }
    return [...magnitude.stationMagnitudes].sort((a, b) => {
      const av = value(a)
      const bv = value(b)
      // A missing value sinks in both directions, as in the arrivals table.
      if (av === undefined && bv === undefined) return a.station.localeCompare(b.station)
      if (av === undefined) return 1
      if (bv === undefined) return -1
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return cmp !== 0 ? cmp * factor : a.station.localeCompare(b.station)
    })
  }, [magnitude.stationMagnitudes, sort])

  if (magnitude.stationMagnitudes.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm" py="6" textAlign="center">
        No station magnitudes for this {magnitudeLabel(magnitude.type)}.
      </Text>
    )
  }

  // Counted per level, as in the arrivals table.
  const levels = magnitude.stationMagnitudes.map((sm) => magnitudeResidualLevel(sm))
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
                              : { key: column.key, asc: false },
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
            {sorted.map((sm) => (
              <Table.Row key={sm.streamId}>
                <Table.Cell textAlign="end" px={{ base: '2', md: '3' }}>
                  <GeometryValue
                    value={sm.distanceKm}
                    source={sm.geometrySource}
                    format={(v) => v.toFixed(1)}
                  />
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap" px={{ base: '2', md: '3' }}>
                  {isMedium ? (
                    <Text fontFamily="mono" fontSize="sm" color="fg.muted">
                      {sm.network}.
                      <Text as="span" fontWeight="bold" color="fg">
                        {sm.station}
                      </Text>
                      .{sm.channel}.{sm.locationCode}
                    </Text>
                  ) : (
                    <Tooltip content={sm.streamId}>
                      <Text fontWeight="medium">{sm.station}</Text>
                    </Tooltip>
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums" px={{ base: '2', md: '3' }}>
                  {sm.magnitude.toFixed(2)}
                </Table.Cell>
                <Table.Cell textAlign="end" px={{ base: '2', md: '3' }}>
                  <ResidualCell stationMagnitude={sm} />
                </Table.Cell>
                {isMedium && hasCoda && (
                  <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums" px="3">
                    {sm.durationSeconds === undefined ? '—' : sm.durationSeconds.toFixed(1)}
                  </Table.Cell>
                )}
                {isMedium && (
                  <Table.Cell textAlign="end" px="3">
                    <GeometryValue
                      value={sm.azimuthDegrees}
                      source={sm.geometrySource}
                      format={(v) => v.toFixed(0)}
                    />
                  </Table.Cell>
                )}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
      <HStack gap="4" px="3" py="2" fontSize="xs" color="fg.muted" wrap="wrap">
        <Text>{magnitude.stationMagnitudes.length} stations</Text>
        {flagged > 0 && (
          <HStack gap="1" color={alerts > 0 ? 'attentionText' : 'warningText'}>
            <Icon size="xs" aria-hidden>
              <LuTriangleAlert />
            </Icon>
            <Text>
              {[
                alerts > 0 ? `${alerts} over ±${MAGNITUDE_RESIDUAL_THRESHOLDS.alert}` : null,
                warnings > 0 ? `${warnings} over ±${MAGNITUDE_RESIDUAL_THRESHOLDS.warning}` : null,
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
