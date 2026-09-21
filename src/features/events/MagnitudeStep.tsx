import {
  Alert,
  Badge,
  Box,
  Grid,
  HStack,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Text,
  createListCollection,
} from '@chakra-ui/react'
import { Suspense, lazy, useMemo, useState } from 'react'
import { useStationsAndSettings } from '../stations/useStations'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { StationMagnitudeTable } from './StationMagnitudeTable'
import { humanize, magnitudeLabel, reviewStatusPalette } from './format'
import { magnitudeResidualLevel } from './eventDetail'
import { toMapStations } from './mapStations'
import { CriteriaBar } from './CriteriaBar'
import { magnitudeCriteria } from './autoAccept'
import type { EventDetail, Magnitude, Origin } from './eventDetail'

/** Matches the Location step, so the two halves of the review look alike. */
const MAP_COLUMN_WIDTH = '380px'
const SPLIT_HEIGHT = '30rem'

const EventMap = lazy(() =>
  import('./EventMap').then((module) => ({ default: module.EventMap })),
)

/**
 * One line of the magnitude dropdown: the value, its type, and the badges
 * that say which one the network settled on and how far it has been reviewed.
 */
function MagnitudeOption({ magnitude }: { magnitude: Magnitude }) {
  return (
    <HStack gap="2" flex="1" minW="0">
      <Text fontWeight="semibold" fontSize="sm" fontVariantNumeric="tabular-nums">
        {magnitude.value === undefined ? '—' : magnitude.value.toFixed(2)}
      </Text>
      <Text fontSize="sm" color="fg.muted">
        {magnitudeLabel(magnitude.type)}
      </Text>
      {magnitude.isPreferred && (
        <Badge size="sm" colorPalette="utahRed" variant="subtle">
          Preferred
        </Badge>
      )}
      {magnitude.reviewStatus && (
        <Badge size="sm" variant="subtle" colorPalette={reviewStatusPalette(magnitude.reviewStatus)}>
          {humanize(magnitude.reviewStatus)}
        </Badge>
      )}
      <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
        {magnitude.stationMagnitudes.length === 0
          ? 'no stations'
          : `${magnitude.stationMagnitudes.length} stations`}
      </Text>
    </HStack>
  )
}

/**
 * The Magnitude step: which magnitude, and the stations behind it.
 *
 * One magnitude is shown at a time, chosen from a dropdown that opens on the
 * preferred one. Buttons for each magnitude wrapped badly on a phone and
 * pushed the table below the fold, which is the wrong trade for a control
 * most analysts will never touch: the preferred magnitude is nearly always
 * the one they came to look at.
 *
 * The table is written against whatever a magnitude happens to carry rather
 * than assuming duration, so the local magnitude filling in later - with no
 * coda column - needs no change here.
 */
export function MagnitudeStep({
  detail,
  origin: chosenOrigin,
  loading,
  error,
}: {
  detail: EventDetail | null
  /**
   * The origin under review, chosen in the summary bar.
   *
   * This step used to read `detail.preferredOrigin` regardless of what the
   * Location step was showing, so an analyst looking at the automatic origin
   * was shown the preferred origin's magnitudes with nothing to say so. A
   * magnitude belongs to an origin - each origin carries its own
   * preferredMagnitudeIdentifier - so the pairing has to follow the choice.
   */
  origin?: Origin
  loading: boolean
  error: string | null
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { epochs, settings, error: stationsError } = useStationsAndSettings()

  /*
    The geometry on these station magnitudes has already been filled in from
    the station list by the page above - see reconcileGeometry. That matters
    here: without it the payload's own nulls would reach the table, and the
    distance column would be empty for exactly the events whose backend
    happened not to compute it.
  */
  const origin = chosenOrigin ?? detail?.preferredOrigin

  // Same breakpoint as the Grid below, so the map is told the height the
  // layout actually gave it.
  const isSplit = useMediaQuery('(min-width: 80em)')

  // Preferred first, then by station count: the ones with something to show
  // ahead of the ones that would open onto an empty table.
  const ordered = useMemo(
    () =>
      [...(origin?.magnitudes ?? [])].sort((a, b) => {
        if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1
        return b.stationMagnitudes.length - a.stationMagnitudes.length
      }),
    [origin],
  )

  const collection = useMemo(
    () =>
      createListCollection({
        items: ordered.map((magnitude) => ({
          value: String(magnitude.id),
          label: `${magnitude.value === undefined ? '—' : magnitude.value.toFixed(2)} ${magnitudeLabel(magnitude.type)}`,
          magnitude,
        })),
      }),
    [ordered],
  )

  const selected = ordered.find((m) => m.id === selectedId) ?? ordered[0]

  const mapStations = useMemo(() => {
    if (selected === undefined || origin === undefined) {
      return { stations: [], unplacedCount: 0 }
    }
    return toMapStations(
      // No phase: a station magnitude is measured on a whole record, not at a
      // pick, so every marker is a plain triangle and only the colour varies.
      selected.stationMagnitudes.map((sm) => ({
        ...sm,
        status: magnitudeResidualLevel(sm),
      })),
      epochs,
      origin.time,
      (key, group) => (
        <>
          <strong>{key}</strong>
          <br />
          {group
            .map(
              (sm) =>
                `${sm.magnitude.toFixed(2)}${
                  sm.residual === undefined
                    ? ''
                    : ` (${sm.residual >= 0 ? '+' : ''}${sm.residual.toFixed(2)})`
                }`,
            )
            .join(', ')}
          <br />
          {group[0].distanceKm === undefined
            ? 'distance unknown'
            : `${group[0].distanceKm.toFixed(1)} km, ${(group[0].azimuthDegrees ?? 0).toFixed(0)}°`}
        </>
      ),
    )
  }, [selected, origin, epochs])

  if (loading && detail === null) {
    return (
      <HStack gap="3" py="10" justify="center" color="fg.muted">
        <Spinner size="sm" />
        <Text>Loading magnitudes…</Text>
      </HStack>
    )
  }
  if (error && detail === null) {
    return (
      <Alert.Root status="error" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    )
  }
  // No map when the stations failed to load, or when none of this
  // magnitude's stations could be placed.
  const hasMap = stationsError === null && mapStations.stations.length > 0

  if (selected === undefined || origin === undefined) {
    return (
      <Text color="fg.muted" py="6">
        No magnitudes for this event.
      </Text>
    )
  }

  return (
    <Stack gap="4">
      <Select.Root
        collection={collection}
        value={[String(selected.id)]}
        size="sm"
        maxW={{ base: 'full', md: '30rem' }}
        onValueChange={(details) => {
          const next = details.value[0]
          // Ark clears the value when an open selector is dismissed; ignore
          // that rather than selecting nothing.
          if (next) setSelectedId(Number(next))
        }}
      >
        <Select.Label fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
          Magnitude
        </Select.Label>
        <Select.Control>
          <Select.Trigger aria-label="Magnitude to review" height="auto" py="1.5">
            <Select.ValueText>
              <MagnitudeOption magnitude={selected} />
            </Select.ValueText>
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Select.Positioner>
          <Select.Content>
            {/* Iterate the collection's own items: Ark matches an option back
                to its entry by identity, not by value. */}
            {collection.items.map((item) => (
              <Select.Item item={item} key={item.value}>
                <MagnitudeOption magnitude={item.magnitude} />
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Select.Root>

      {/*
        The same bar the Location step uses, asking the same question of the
        magnitudes. Origin-level, not per-magnitude: the Ml-Md agreement is a
        comparison BETWEEN magnitudes, and the station residual rule has to
        hold for every magnitude that has stations - so switching the selector
        does not change the verdict.
      */}
      <CriteriaBar criteria={magnitudeCriteria(origin)} />

      {/*
        The fixed height exists so the map and the table agree on one; with no
        map there is nothing to agree with, and pinning an empty state to
        30rem just leaves a large blank panel.
      */}
      <Grid
        gap="4"
        templateColumns={{ base: '1fr', xl: hasMap ? `${MAP_COLUMN_WIDTH} 1fr` : '1fr' }}
        height={{ base: 'auto', xl: hasMap ? SPLIT_HEIGHT : 'auto' }}
        minH="0"
      >
        {/* The map is an aid, never a requirement: if the stations fail to
            load, or none of them could be placed, the table still answers the
            question on its own. */}
        {hasMap && (
          <Suspense fallback={<Skeleton height={{ base: '20rem', xl: '100%' }} rounded="lg" />}>
            <EventMap
              origin={origin}
              stations={mapStations.stations}
              unplacedCount={mapStations.unplacedCount}
              stadiaMapKey={settings?.stadiaMapKey}
              height={isSplit ? '100%' : '20rem'}
            />
          </Suspense>
        )}
        <Box borderWidth="1px" rounded="lg" overflow="hidden" bg="bg.panel" minH="0">
          <StationMagnitudeTable magnitude={selected} fillHeight={isSplit && hasMap} />
        </Box>
      </Grid>
    </Stack>
  )
}
