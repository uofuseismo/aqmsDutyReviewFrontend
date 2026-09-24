import {
  Badge,
  Box,
  HStack,
  Heading,
  Select,
  Stack,
  Text,
  createListCollection,
} from '@chakra-ui/react'
import { useMemo, type ReactNode } from 'react'
import {
  formatDepth,
  formatLatitude,
  formatLongitude,
  formatMagnitude,
  formatUtc,
  magnitudeLabel,
  reviewStatusPalette,
  humanize,
} from './format'
import { LuArrowLeft } from 'react-icons/lu'
import { Link as RouterLink } from 'react-router'
import { Tooltip } from '../../components/ui/Tooltip'
import { summariseRegions } from './regions'
import type { Origin } from './eventDetail'
import type { CatalogEvent } from './types'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="0" minW="0">
      <Text fontSize="2xs" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="medium" fontVariantNumeric="tabular-nums" truncate>
        {value}
      </Text>
    </Stack>
  )
}

/**
 * The identity of the event under review, pinned above the workflow.
 *
 * Once an analyst is three steps into locating and re-picking, the screen is
 * full of the step's own detail; this is the anchor that says which event
 * this is and what its current solution looks like, so nobody finishes a
 * review having lost track of what they were reviewing.
 */
export function EventSummaryBar({
  event,
  origin,
  origins = [],
  preferredOriginId,
  onSelectOrigin,
  notice,
}: {
  event: CatalogEvent
  /** Every origin on the event, so one can be chosen from here. */
  origins?: Origin[]
  preferredOriginId?: number
  onSelectOrigin?: (originId: number) => void
  /**
   * The preferred origin from the event's own detail, when it has loaded.
   *
   * It wins over the catalog row. The catalog is a two-minute-old summary
   * carrying whichever origin it was built from; the detail is fetched on
   * opening the event and names the preferred origin explicitly. Without
   * this the bar and the Location step below it can quote different depths
   * for the same event - which is precisely the disagreement that makes an
   * analyst stop believing either number.
   *
   * Now also the origin the whole REVIEW is about: chosen here, obeyed by
   * every step. The facts on this line are its facts, so the control that
   * changes them belongs on the same line.
   */
  origin?: Origin
  /**
   * Something that must stay in view whatever the reviewer is scrolled to -
   * rendered inside the sticky box, under the facts.
   *
   * The solution-changed notice lives here. Above the steps it scrolled away
   * with the page, and the first real test of it was an analyst on Summary,
   * pressing Accept, for whom it was easy to miss.
   */
  notice?: ReactNode
}) {
  const latitude = origin?.latitude ?? event.latitude
  const longitude = origin?.longitude ?? event.longitude
  const depthKm = origin?.depthKm ?? event.depthKm
  const time = origin?.time ?? event.time
  const reviewStatus = origin?.reviewStatus ?? event.reviewStatus
  const hasPicker = origins.length > 1 && onSelectOrigin !== undefined && origin !== undefined
  const preferredMagnitude = origin?.magnitudes.find((m) => m.isPreferred)
  const magnitudeValue = preferredMagnitude?.value ?? event.magnitude
  const magnitudeType = preferredMagnitude?.type ?? event.magnitudeType
  // An unlocated event has no coordinates to test, so it gets no tag at all
  // rather than one claiming it is outside everything.
  const region = origin === undefined && !event.hasLocation
    ? null
    : summariseRegions(latitude, longitude)
  return (
    <Box
      borderWidth="1px"
      rounded="lg"
      bg="bg.panel"
      px={{ base: '3', md: '4' }}
      py="3"
      position="sticky"
      top="0"
      zIndex="docked"
    >
      <Stack gap="3">
        <HStack justify="space-between" gap="3" wrap="wrap">
          <HStack gap={{ base: '2', md: '3' }} align="center" minW="0">
            {/*
              The way out, folded into the bar rather than sitting in a row of
              its own above it.

              The app's own title already goes home, so the standalone "All
              events" row was a second copy of that in exchange for about 50px
              of height. Here it costs nothing - this line had room - and it
              is now STICKY, so the way out is on screen at any scroll
              position instead of only at the top of the page.

              First in the bar and therefore early in the tab order, which is
              where a way out belongs.
            */}
            <Tooltip content="Back to all events">
              <Box
                asChild
                color="fg.muted"
                _hover={{ color: 'fg' }}
                flexShrink="0"
                aria-label="All events"
              >
                <RouterLink to="/">
                  <HStack gap="1.5" fontSize="sm">
                    <LuArrowLeft aria-hidden />
                    <Text display={{ base: 'none', md: 'block' }}>All events</Text>
                  </HStack>
                </RouterLink>
              </Box>
            </Tooltip>
          </HStack>

          <HStack gap="2" align="baseline" flex="1" minW="0">
            {/* The event identifier IS the page's subject, so it is the h1 -
                more use to heading navigation than the app's own name. */}
            <Heading as="h1" size="lg" fontWeight="bold" fontVariantNumeric="tabular-nums">
              {event.id}
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              {/* Joined rather than concatenated: an absent geographic type
                  otherwise leaves a dangling separator. */}
              {[humanize(event.eventType), humanize(event.geographicType)]
                .filter((part) => part !== '')
                .join(' · ')}
            </Text>
          </HStack>
          <HStack gap="2">
            {/*
              Where it is, next to what state it is in. It used to sit in the
              Location step under its own "REGION" label - a whole row to say
              "FORGE, Utah, Reporting boundary", which is one fact stated
              three times. Up here it costs nothing: the bar already had space
              on this line.
            */}
            {region !== null && (
              <Tooltip content={region.detail}>
                <Badge
                  variant="subtle"
                  colorPalette={region.outside ? 'orange' : 'utahRed'}
                >
                  {region.label}
                </Badge>
              </Tooltip>
            )}
            {/* The picker names the chosen origin's status ("7978 · preferred
                · Incomplete"), so this badge would say it a second time in the
                same row. Kept for the single-origin case, where there is no
                picker to carry it. */}
            {!hasPicker && (
              <Badge colorPalette={reviewStatusPalette(reviewStatus)} variant="subtle">
                {humanize(reviewStatus)}
              </Badge>
            )}
          </HStack>
        </HStack>

        <HStack
          gap={{ base: '4', md: '6' }}
          wrap="wrap"
          // Scrolls rather than wrapping into a tall block on a small phone.
          overflowX="auto"
        >
          {/* Only where there is a choice to make. One origin needs no
              selector, and most events have one. */}
          {hasPicker && (
            <OriginPicker
              origins={origins}
              selectedId={origin.id}
              preferredOriginId={preferredOriginId}
              onSelect={onSelectOrigin}
            />
          )}
          <Fact label="Origin time (UTC)" value={formatUtc(time)} />
          <Fact label="Latitude" value={formatLatitude(latitude)} />
          <Fact label="Longitude" value={formatLongitude(longitude)} />
          <Fact label="Depth" value={formatDepth(depthKm)} />
          <Fact
            label="Magnitude"
            value={
              magnitudeValue === undefined
                ? '—'
                : `${formatMagnitude(magnitudeValue)} ${magnitudeLabel(magnitudeType)}`
            }
          />
        </HStack>
        {notice}
      </Stack>
    </Box>
  )
}

/** `7978 · Preferred · Finalized` - identifier first, because that is the part
    an analyst matches against what the backend told them. */
function originLabel(origin: Origin, preferredOriginId?: number): string {
  const parts = [String(origin.id)]
  if (origin.id === preferredOriginId) parts.push('Preferred')
  if (origin.reviewStatus) parts.push(humanize(origin.reviewStatus))
  return parts.join(' · ')
}

/**
 * Which origin the review is about.
 *
 * A Select rather than a row of buttons: it sits in a line that already
 * carries five facts, and on a phone three buttons would wrap the row onto a
 * second line to offer a choice most events never present.
 *
 * Labelled by identifier and state, because that is how an analyst tells them
 * apart - "the finalized one" and "the automatic one", not "the first one".
 */
function OriginPicker({
  origins,
  selectedId,
  preferredOriginId,
  onSelect,
}: {
  origins: Origin[]
  selectedId: number
  preferredOriginId?: number
  onSelect: (originId: number) => void
}) {
  const collection = useMemo(
    () =>
      createListCollection({
        items: origins.map((origin) => ({
          value: String(origin.id),
          label: originLabel(origin, preferredOriginId),
        })),
      }),
    [origins, preferredOriginId],
  )

  /*
    Amber when the review is NOT on the preferred origin.

    Same rule the residuals and the criteria bar follow: colour is spent on
    the thing that wants a second look, never on the ordinary case. Reviewing
    the preferred origin is the ordinary case, so it stays plain; wandering
    off it is the state worth noticing from across the bar, and it is the same
    state the Summary spells out in words before anyone accepts.
  */
  const offPreferred = preferredOriginId !== undefined && selectedId !== preferredOriginId
  const selectedLabel =
    collection.items.find((item) => item.value === String(selectedId))?.label ?? String(selectedId)

  return (
    <Select.Root
      collection={collection}
      value={[String(selectedId)]}
      size="xs"
      width="14rem"
      onValueChange={(details) => {
        const next = details.value[0]
        // Ark clears the value when a selector is dismissed; ignore that.
        if (next) onSelect(Number(next))
      }}
    >
      <Select.Label
        fontSize="2xs"
        color="fg.muted"
        textTransform="uppercase"
        letterSpacing="wide"
      >
        Origin
      </Select.Label>
      <Select.Control>
        <Select.Trigger
          /* Bold so the chosen origin reads as a value rather than as one
             more label in a row of five facts. */
          fontWeight="semibold"
          color={offPreferred ? 'warningText' : undefined}
          /* The value goes in the accessible name: aria-label overrides the
             trigger's own text, so without it a screen reader announces the
             control and not which origin is in it. */
          aria-label={`Origin under review: ${selectedLabel}`}
        >
          <Select.ValueText />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          {collection.items.map((item) => (
            <Select.Item
              item={item}
              key={item.value}
              /* The open list gets the same treatment, so the one being
                 reviewed is identifiable before the tick is read. */
              _checked={{ fontWeight: 'semibold' }}
            >
              {item.label}
              <Select.ItemIndicator />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  )
}
