import { Alert, Box, Button, HStack, Portal, Skeleton, Spinner, Stack, Text } from '@chakra-ui/react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuZoomOut } from 'react-icons/lu'
import { buildRecordSection } from './waveforms'
import { useWaveforms } from './useWaveforms'
import { LANE_HEIGHT } from './laneHeight'
import type { Arrival } from '../events/eventDetail'

/**
 * Chart.js is 61 KB gzipped and nobody on the event list needs it, so it
 * loads with the record section rather than with the app - the same bargain
 * the Leaflet map makes.
 */
const WaveformChart = lazy(() =>
  import('./WaveformChart').then((module) => ({ default: module.WaveformChart })),
)

export interface WaveformPanelProps {
  eventId: number
  /** The preferred origin the picks belong to - part of the cache key. */
  originId?: number
  /** The picks to draw. These are the origin's own arrivals. */
  arrivals: Arrival[]
  originMs?: number
  /**
   * Where the zoom hint and Reset zoom go: an element OUTSIDE the scrolling
   * area, beside the tabs. Null while that tab strip has nowhere for them -
   * the Map tab is showing - and then they are not drawn at all.
   */
  controlsSlot: HTMLElement | null
}

/**
 * The record section for an origin's picks.
 *
 * Waveforms are an aid, not a gate: if they fail to load, the arrivals table
 * and the map above still answer the question, so a failure here is a notice
 * inside this panel rather than anything that interrupts the review.
 */
export function WaveformPanel({
  eventId,
  originId,
  arrivals,
  originMs,
  controlsSlot,
}: WaveformPanelProps) {
  const { channels, loading, error } = useWaveforms(eventId, originId)
  const resetRef = useRef<(() => void) | null>(null)
  const [canReset, setCanReset] = useState(false)
  /** Zoomed or panned away from the full record - something to reset. */
  const [zoomed, setZoomed] = useState(false)
  /*
    Whether the chart is on screen at all.

    The steps and tabs stay mounted when hidden, so "zoomed" alone would
    float a Reset button over the Map tab, the Magnitude step, or the table
    far below the traces. An element that is display:none, or scrolled out
    of view, does not intersect - so this answers all three.
  */
  const [chartBox, setChartBox] = useState<HTMLDivElement | null>(null)
  const [chartInView, setChartInView] = useState(false)
  useEffect(() => {
    if (chartBox === null) return
    const observer = new IntersectionObserver(([entry]) => setChartInView(entry.isIntersecting))
    observer.observe(chartBox)
    return () => observer.disconnect()
  }, [chartBox])

  const traces = useMemo(() => buildRecordSection(channels, arrivals), [channels, arrivals])

  const onReady = useCallback((reset: () => void) => {
    resetRef.current = reset
    setCanReset(true)
  }, [])

  const unfiltered = traces.filter((trace) => trace.channel.partiallyUnfiltered)

  if (loading && channels.length === 0) {
    return (
      <HStack gap="3" py="8" justify="center" color="fg.muted">
        <Spinner size="sm" />
        <Text>Loading waveforms…</Text>
      </HStack>
    )
  }

  if (error !== null) {
    return (
      <Alert.Root status="warning" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>No waveforms</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    )
  }

  if (traces.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm" py="6" textAlign="center">
        No waveforms for this origin's picks.
      </Text>
    )
  }

  return (
    <Stack gap="2">
      {/*
        Beside the tabs, not over the chart.

        It was a full-width bar pinned to the top of the scrolling record
        section - sticky because a reviewer who zoomed in and scrolled down
        lost the way out and thought the app had broken. But pinned OVER the
        chart, it hid a strip of whichever trace scrolled beneath it. The tab
        strip sits outside the scrolling area, so it is always in view on a
        wide screen without covering anything, and it had empty room.

        The caption that used to sit here is gone: "8 channels · bandpassed in
        the browser · nearest first" told nobody anything they wanted.
      */}
      {/*
        Wide screens only. On a phone the gestures are the ones every map and
        photo uses, and instructions were noise; Reset is the floating button
        below instead.
      */}
      {controlsSlot &&
        createPortal(
          <HStack gap="2" display={{ base: 'none', md: 'flex' }}>
            {/* Different bargains on different inputs, so say which. */}
            <Text fontSize="2xs" color="fg.muted" display={{ base: 'none', lg: 'block' }}>
              drag to zoom · shift-scroll to zoom · shift-drag to pan
            </Text>
            {/* Greyed until there is something to undo: enabled-and-inert
                said nothing about whether you were zoomed. */}
            <Button
              size="xs"
              variant="outline"
              disabled={!canReset || !zoomed}
              onClick={() => resetRef.current?.()}
            >
              <LuZoomOut /> Reset zoom
            </Button>
          </HStack>,
          controlsSlot,
        )}

      {/*
        The phone's way out: floating, and only while there is something to
        reset and the traces are on screen.

        On a phone the page scrolls rather than the chart, so a Reset in the
        tab row scrolls away - and with a dozen traces, the one you zoomed on
        can be well below it. Floating keeps it under the thumb, and showing it
        only while zoomed means it covers nothing the rest of the time.
      */}
      {canReset && zoomed && chartInView && (
        <Portal>
          <Button
            display={{ base: 'inline-flex', md: 'none' }}
            position="fixed"
            right="4"
            bottom="calc(1rem + env(safe-area-inset-bottom))"
            zIndex="docked"
            size="md"
            rounded="full"
            boxShadow="lg"
            onClick={() => resetRef.current?.()}
          >
            <LuZoomOut /> Reset zoom
          </Button>
        </Portal>
      )}

      {unfiltered.length > 0 && (
        // Named, not counted: "one channel is unfiltered" is not actionable,
        // "FOR8 is unfiltered" tells you which trace to distrust.
        <Text fontSize="xs" color="fg.muted">
          Unfiltered (no design for the sampling rate):{' '}
          {unfiltered.map((trace) => trace.channel.streamId).join(', ')}
        </Text>
      )}

      <Box ref={setChartBox} height={`${traces.length * LANE_HEIGHT}px`} minH="12rem">
        <Suspense fallback={<Skeleton height="100%" rounded="md" />}>
          <WaveformChart
            traces={traces}
            originMs={originMs}
            onReady={onReady}
            onZoomedChange={setZoomed}
          />
        </Suspense>
      </Box>
    </Stack>
  )
}
