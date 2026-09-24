import { Alert, Box, Grid, HStack, Skeleton, Spinner, Stack, Tabs, Text } from '@chakra-ui/react'
import { Suspense, lazy } from 'react'
import { useStationsAndSettings } from '../stations/useStations'
import { useQuarries } from '../gazetteer/useQuarries'
import { quarriesWithin } from '../gazetteer/quarries'
import { QUARRY_PROXIMITY_KM } from '../../api/config'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ArrivalsTable } from './ArrivalsTable'
import { arrivalResidualLevel } from './eventDetail'
import { toMapStations } from './mapStations'
import { CriteriaBar } from './CriteriaBar'
import { locationCriteria } from './autoAccept'
import { formatUtcTimeOnly } from './format'
import { WaveformPanel } from '../waveforms/WaveformPanel'
import { LuActivity, LuMap } from 'react-icons/lu'
import type { EventDetail, Origin } from './eventDetail'

/**
 * Leaflet and its tiles are the heaviest thing in the app, and nobody on the
 * event list needs them. Split out so the map only downloads when somebody
 * actually opens an event.
 */
const EventMap = lazy(() =>
  import('./EventMap').then((module) => ({ default: module.EventMap })),
)

/**
 * Where the map stops and the table starts, and how tall the pair is.
 *
 * 380px is enough to read an epicentre against its stations; the table needs
 * everything else. 30rem is roughly a dozen rows before scrolling, which
 * covers most events without the section dominating the page.
 */
const MAP_COLUMN_WIDTH = '380px'

/**
 * Everything on the review page that is not the tabbed panel.
 *
 * Header, summary bar, the step rail and the page's padding - the back link
 * is inside the summary bar now and costs no height of its own.
 * MEASURED, by reading how much room was left under the panel and giving it
 * back - guessing left 178px of the window unused at 900px tall with the map
 * squeezed into 234px, and moving the region tags into the summary bar and
 * Back/Next into the rail freed another 121px on top of that.
 *
 * The 18rem floor is what a 800px laptop gets, where the arithmetic would
 * otherwise leave under 200px. The table scrolls inside itself at that size,
 * so it stays usable, and a little scrolling beats a map two rows tall.
 */
const PANEL_CHROME = '20rem'

export function LocationStep({
  eventId,
  detail,
  origin,
  loading,
  error,
}: {
  /** Needed to fetch the waveforms; the detail payload does not carry it. */
  eventId: number
  detail: EventDetail | null
  /**
   * The origin under review, chosen in the summary bar above.
   *
   * Not chosen here any more: this step used to own the choice privately,
   * which let the Magnitude step show a different origin's magnitudes without
   * anybody noticing.
   */
  origin?: Origin
  loading: boolean
  error: string | null
}) {
  const { stations, epochs, settings, error: stationsError } = useStationsAndSettings()
  const { quarries, error: quarriesError } = useQuarries()

  // Matches the `xl` templateColumns breakpoint below; the components need to
  // know in JS, not only in CSS.
  const isSplit = useMediaQuery('(min-width: 80em)')

  if (loading && detail === null) {
    return (
      <HStack gap="3" py="10" justify="center" color="fg.muted">
        <Spinner size="sm" />
        <Text>Loading the solution…</Text>
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
  if (detail === null || detail.origins.length === 0) {
    return (
      <Text color="fg.muted" py="6">
        No origins for this event.
      </Text>
    )
  }

  const selected = origin ?? detail.preferredOrigin ?? detail.origins[0]

  /*
    Waveforms are fetched for the LOCATION's picks - the preferred origin's -
    so a different origin gets no record section rather than one belonging to
    a solution it does not share.
  */
  const hasWaveforms = selected.id === detail.preferredOrigin?.id

  /*
    Quarries close enough to matter.

    Not memoised, deliberately: `selected` is only known after the guards
    above, so a memo here would be a conditional hook. It does not need one -
    the latitude window inside rejects all but a handful of the 494 rows
    before any geodesic runs, which is far less work than the memo's own
    dependency check would save.
  */
  const nearbyQuarries = quarriesWithin(selected, quarries, QUARRY_PROXIMITY_KM)

  const mapStations = toMapStations(
    selected.arrivals.map((arrival) => ({
      ...arrival,
      status: arrivalResidualLevel(arrival),
    })),
    epochs,
    selected.time,
    (key, group) => (
      <>
        <strong>{key}</strong>
        <br />
        {group
          .map(
            (a) =>
              `${a.phase} ${a.residualSeconds >= 0 ? '+' : ''}${a.residualSeconds.toFixed(2)}s`,
          )
          .join(', ')}
        <br />
        {group[0].distanceKm === undefined
          ? 'distance unknown'
          : `${group[0].distanceKm.toFixed(1)} km, ${(group[0].azimuthDegrees ?? 0).toFixed(0)}\u00B0`}
        <br />
        {formatUtcTimeOnly(group[0].time)} UTC
      </>
    ),
  )

  return (
    <Stack gap="4">



      {/*
        Side by side once there is room for both, stacked otherwise.

        The map column is a fixed width rather than a fraction: it only needs
        to be big enough to read the geometry, and every pixel beyond that is
        better spent on the table, which has seven columns to place. The row
        is a fixed height so the two halves agree - the map fills it, the
        table scrolls inside it - instead of one dictating the other.

        The split waits for a genuinely wide window. Halving a 1024px screen
        leaves the table about 600px, which is not enough for seven columns
        without it becoming a squeeze.
      */}
      {/*
        How good this solution is, for the origin currently SELECTED, judged
        against the auto-accept rules.

        These belong to the origin, not the event: on 31151981 the preferred
        origin has a 140 degree gap over 8 defining phases and the automatic
        one has 161 over 6. Reading them off the catalog row would have shown
        one origin's numbers under both, which is the sort of wrong that looks
        right. One line, because the compaction work above was not free.
      */}
      <CriteriaBar criteria={locationCriteria(selected)} />

      {/*
        Map-and-arrivals in one tab, the record section in the other.

        Stacked, these came to 1202px on a 1440x900 screen and put the Next
        button 696px below the fold - so working an event meant scrolling down
        to read, then back up to move on, on every single event. Only one of
        the two is being read at a time anyway.

        The container's height is derived from the VIEWPORT rather than fixed,
        because a fixed height that fits a 1080px screen still buries the
        button on a 800px laptop. `PANEL_CHROME` is everything above and below
        it that cannot shrink - measured, not guessed - so the panel takes
        what is left and the step always ends on screen.
      */}
      <Tabs.Root
        /*
          Waveforms first and selected by default: the traces are what
          actually answer "is this pick on the right phase", and the map and
          residuals are the supporting evidence. On a non-preferred origin
          there are no waveforms, so the map takes the default instead.
        */
        defaultValue={hasWaveforms ? 'waveforms' : 'map'}
        variant="enclosed"
        size="sm"
        display="flex"
        flexDirection="column"
        minH="0"
        height={{ base: 'auto', md: `clamp(18rem, calc(100dvh - ${PANEL_CHROME}), 45rem)` }}
      >
        <Tabs.List>
          {hasWaveforms && (
            <Tabs.Trigger value="waveforms">
              <LuActivity /> Waveforms
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="map">
            <LuMap /> Map &amp; arrivals
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="map" flex="1" minH="0" pt="3" display="flex" flexDirection="column">
          <Grid
            gap="4"
            templateColumns={{ base: '1fr', xl: `${MAP_COLUMN_WIDTH} 1fr` }}
            flex="1"
            minH="0"
            height={{ base: 'auto', md: '100%' }}
          >
            {/* The map is an aid, never a requirement: if stations or the map key
                fail to load, the table still answers the question. */}
            {stationsError === null && stations.size > 0 && (
              <Suspense
                fallback={<Skeleton height={{ base: '20rem', xl: '100%' }} rounded="lg" />}
              >
                <EventMap
                  origin={selected}
                  stations={mapStations.stations}
                  quarries={nearbyQuarries}
                  unplacedCount={mapStations.unplacedCount}
                  stadiaMapKey={settings?.stadiaMapKey}
                  height={isSplit ? '100%' : '20rem'}
                  allowSatellite
                />
              </Suspense>
            )}

            <Box
              borderWidth="1px"
              rounded="lg"
              overflow="hidden"
              bg="bg.panel"
              minW="0"
              minH="0"
            >
              <ArrivalsTable
                arrivals={selected.arrivals}
                fillHeight={isSplit}
                /*
                  `compact` when split, which drops the arrival time. The page
                  container caps at 6xl, so the table pane tops out around 690px
                  however wide the window gets - never enough for all seven
                  columns. Dropping the least-used one beats clipping it.
                */
                density={isSplit ? 'compact' : undefined}
              />
            </Box>
            {quarriesError !== null && (
              /* Said out loud, because a missing quarry marker is
                 indistinguishable from there being no quarry - and those mean
                 opposite things to somebody deciding whether this is a blast. */
              <Text fontSize="xs" color="warningText" gridColumn={{ base: '1', xl: '1 / -1' }}>
                {quarriesError} Quarries are not marked on this map.
              </Text>
            )}
          </Grid>
        </Tabs.Content>

        {/*
          Only for the PREFERRED origin. The waveform request is scoped to the
          location's picks, so showing it under some other origin's arrivals
          would put one origin's picks against another's traces.
        */}
        {hasWaveforms && (
          <Tabs.Content
            value="waveforms"
            flex="1"
            minH="0"
            pt="3"
            overflowY="auto"
          >
            <WaveformPanel
              eventId={eventId}
              originId={selected.id}
              arrivals={selected.arrivals}
              originMs={selected.time.getTime()}
            />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </Stack>
  )
}
