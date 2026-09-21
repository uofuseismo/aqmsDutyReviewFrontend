import { Alert, Box, Button, HStack, Spinner, Stack, Steps, Text } from '@chakra-ui/react'
import { LuArrowLeft } from 'react-icons/lu'
import { Link as RouterLink, useParams } from 'react-router'
import { EventSummaryBar } from './EventSummaryBar'
import { LocationStep } from './LocationStep'
import { MagnitudeStep } from './MagnitudeStep'
import { useEventDetail } from './useEventDetail'
import { LockNotice } from './LockNotice'
import { useLocks } from './useLocks'
import { useCatalog } from './useCatalog'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { SummaryStep } from './SummaryStep'
import { useStationsAndSettings } from '../stations/useStations'
import { reconcileGeometry } from './reconcileGeometry'
import { useMemo, useState } from 'react'

/**
 * The review workflow: location, then magnitudes, then a summary carrying the
 * accept/cancel decision.
 *
 * The steps are scaffolding at this point - the panels are placeholders. What
 * is real is the shape around them: the summary bar that keeps the event's
 * identity on screen, and the way out.
 */
const STEPS = [
  { title: 'Location', description: 'Check the origin' },
  { title: 'Magnitude', description: 'Check the magnitudes' },
  { title: 'Summary', description: 'Accept or cancel' },
]

export function EventReviewPage() {
  const { eventId } = useParams()
  const { events, loading, error, reload } = useCatalog()
  const { locks } = useLocks()
  const {
    detail: rawDetail,
    loading: detailLoading,
    error: detailError,
    reload: reloadDetail,
  } = useEventDetail(Number.isFinite(Number(eventId)) ? Number(eventId) : undefined)
  const { epochs } = useStationsAndSettings()

  /*
    WHICH ORIGIN the whole review is about, chosen once and obeyed by every
    step.

    It used to live inside the Location step, so picking the automatic origin
    there changed the map and the arrivals while the Magnitude step carried on
    showing the PREFERRED origin's magnitudes - and said nothing about it.
    Magnitudes belong to an origin (each carries its own
    preferredMagnitudeIdentifier; event 31151981's two origins point at 5523
    and 104336), so that pairing was simply wrong.

    Held as a pair with the event so a stale choice cannot outlive the event
    it was made on.
  */
  const [chosen, setChosen] = useState<{ eventId?: string; originId: number } | null>(null)

  /*
    Fill in the source-receiver geometry the payload did not carry, from the
    origin and the station list.

    Done here rather than in either step because both of them need it - the
    arrivals table and the station magnitude table sit next to each other in
    the same workflow showing the same distances - and doing it twice would
    mean two copies of the same detail and two chances for them to disagree.
    It returns the same object untouched when nothing needed filling, so the
    memos downstream keep their identity.
  */
  const detail = useMemo(() => reconcileGeometry(rawDetail, epochs), [rawDetail, epochs])
  const id = Number(eventId)
  const event = events.find((candidate) => candidate.id === id)

  // Defaults to preferred, every time, for every event.
  const origin =
    (chosen !== null && chosen.eventId === eventId
      ? detail?.origins.find((candidate) => candidate.id === chosen.originId)
      : undefined) ??
    detail?.preferredOrigin ??
    detail?.origins[0]

  /*
    Only when there is nothing to show yet.

    `if (loading)` alone swapped the whole page for a spinner every time the
    catalog was re-read - which unmounted the review workflow and took its
    state with it. Accepting an event refreshes the catalog, so the step a
    reviewer had just acted on vanished and came back at step one, with the
    confirmation they were meant to read already gone.

    A refresh of something already on screen should be invisible. The catalog
    is stale-while-revalidate by design; this guard is only for the first load.
  */
  if (loading && events.length === 0) {
    return (
      <HStack gap="3" py="10" justify="center" color="fg.muted">
        <Spinner size="sm" />
        <Text>Loading event {eventId}…</Text>
      </HStack>
    )
  }

  if (error || !event) {
    return (
      <Stack gap="4">
        <Alert.Root status={error ? 'error' : 'warning'} role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error ? 'Could not load the catalog' : 'Event not found'}</Alert.Title>
            <Alert.Description>
              {error ??
                `Event ${eventId} is not in the current catalog window. It may have fallen outside it.`}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
        <BackToList />
      </Stack>
    )
  }

  return (
    <Stack gap="4">
      {/* The way out now lives inside the summary bar, which is sticky - see
          the note there. The bar is the first thing in the tab order either
          way. */}
      <EventSummaryBar
        event={event}
        origin={origin}
        origins={detail?.origins ?? []}
        preferredOriginId={detail?.preferredOrigin?.id}
        onSelectOrigin={(next) => setChosen({ eventId, originId: next })}
      />
      {/* Stated before the steps: whether somebody else is in here is the
          first thing that should change what you do next. */}
      {locks.get(event.id) && <LockNotice lock={locks.get(event.id)!} />}

      <Steps.Root defaultStep={0} count={STEPS.length} size="sm">
      {/*
        Back and Next live IN the step rail on a wide screen.

        They were a row of their own below the panel, which cost about 50px
        of height purely to hold two buttons at opposite ends of an empty
        line - and that row was the thing falling off the bottom of the
        screen. Beside the rail they sit next to the progress they act on.

        On a phone the rail is already just three circles and a pair of
        buttons would crowd it, so there they stay at the bottom, which is
        where a thumb expects them anyway.
      */}
      <HStack gap="3" align="center">
        <Steps.PrevTrigger asChild>
          <Button variant="outline" size="sm" display={{ base: 'none', md: 'inline-flex' }}>
            Back
          </Button>
        </Steps.PrevTrigger>

        <Steps.List flex="1" minW="0">
          {STEPS.map((step, index) => (
            <Steps.Item key={step.title} index={index} title={step.title}>
              {/*
                Steps.Trigger is not decoration. Steps.List renders as a
                tablist whose aria-owns points at "…:trigger:N" ids, and the
                trigger is what carries those ids and the tab role. Leaving it
                out gave a tablist owning elements that did not exist, with
                children that were plain divs - two critical findings in an
                axe scan, and a step list a screen reader could not navigate.

                It also makes the steps clickable, which is what the indicator
                looked like it did anyway.

                One axe finding survives this and is NOT ours to fix:
                aria-required-children, because Chakra wraps each trigger in a
                plain <div> that ends up a direct child of the tablist. The
                triggers are correctly aria-owned by the list, so assistive
                technology finds them; the wrapper is the problem. Marking the
                wrapper role="presentation" does not help - it carries
                aria-current, and a global ARIA attribute makes the browser
                ignore a presentation role. Upstream, in Chakra v3.37.
              */}
              {/*
                Named explicitly, because the visible title is hidden below
                `md` and the trigger would otherwise be a button containing
                only a number - three unnamed buttons on a phone, which is
                exactly where this app is used. The label carries both lines
                so it still contains the visible text where that is shown.
              */}
              <Steps.Trigger aria-label={`${step.title}, ${step.description}`}>
                <Steps.Indicator />
                <Box display={{ base: 'none', md: 'block' }} textAlign="start">
                  <Steps.Title>{step.title}</Steps.Title>
                  <Steps.Description>{step.description}</Steps.Description>
                </Box>
              </Steps.Trigger>
              <Steps.Separator />
            </Steps.Item>
          ))}
        </Steps.List>

        <Steps.NextTrigger asChild>
          <Button colorPalette="utahRed" size="sm" display={{ base: 'none', md: 'inline-flex' }}>
            Next
          </Button>
        </Steps.NextTrigger>
      </HStack>

        <Steps.Content index={0}>
          <Box borderWidth="1px" rounded="lg" bg="bg.panel" p={{ base: '3', md: '5' }} minH="16rem">
            <ErrorBoundary label="The location" resetKey={event.id}>
              <LocationStep
                eventId={event.id}
                detail={detail}
                origin={origin}
                loading={detailLoading}
                error={detailError}
              />
            </ErrorBoundary>
          </Box>
        </Steps.Content>
        <Steps.Content index={1}>
          <Box borderWidth="1px" rounded="lg" bg="bg.panel" p={{ base: '3', md: '5' }} minH="16rem">
            <ErrorBoundary label="The magnitudes" resetKey={event.id}>
              <MagnitudeStep
                detail={detail}
                origin={origin}
                loading={detailLoading}
                error={detailError}
              />
            </ErrorBoundary>
          </Box>
        </Steps.Content>

        <Steps.Content index={2}>
          <Box borderWidth="1px" rounded="lg" bg="bg.panel" p={{ base: '3', md: '5' }} minH="12rem">
            <ErrorBoundary label="The summary" resetKey={event.id}>
              {/* The catalog behind us still holds this event's old status. */}
              <SummaryStep
                event={event}
                detail={detail}
                origin={origin}
                onDone={reload}
                onRefresh={reloadDetail}
              />
            </ErrorBoundary>
          </Box>
        </Steps.Content>
        <Steps.CompletedContent>
          <Box borderWidth="1px" rounded="lg" bg="bg.panel" p="6" minH="16rem">
            <Text fontWeight="semibold">Review complete</Text>
            <Text color="fg.muted" fontSize="sm">
              Accept and cancel will post to /actions once the steps are real.
            </Text>
          </Box>
        </Steps.CompletedContent>

        {/* The phone's copy of the same two triggers. Only one of the pair is
            ever in the document, so assistive technology sees one Back and
            one Next, not two of each. */}
        <HStack pt="4" justify="space-between" display={{ base: 'flex', md: 'none' }}>
          <Steps.PrevTrigger asChild>
            <Button variant="outline" size="sm">
              Back
            </Button>
          </Steps.PrevTrigger>
          <Steps.NextTrigger asChild>
            <Button colorPalette="utahRed" size="sm">
              Next
            </Button>
          </Steps.NextTrigger>
        </HStack>
      </Steps.Root>
    </Stack>
  )
}

function BackToList() {
  return (
    <Box asChild alignSelf="flex-start">
      <RouterLink to="/">
        <HStack gap="1.5" color="fg.muted" _hover={{ color: 'fg' }} fontSize="sm">
          <LuArrowLeft aria-hidden />
          <Text>All events</Text>
        </HStack>
      </RouterLink>
    </Box>
  )
}
