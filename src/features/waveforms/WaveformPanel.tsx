import { Alert, Box, Button, HStack, Skeleton, Spinner, Stack, Text } from '@chakra-ui/react'
import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react'
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
  /** The picks to draw. These are the origin's own arrivals. */
  arrivals: Arrival[]
  originMs?: number
}

/**
 * The record section for an origin's picks.
 *
 * Waveforms are an aid, not a gate: if they fail to load, the arrivals table
 * and the map above still answer the question, so a failure here is a notice
 * inside this panel rather than anything that interrupts the review.
 */
export function WaveformPanel({ eventId, arrivals, originMs }: WaveformPanelProps) {
  const { channels, loading, error } = useWaveforms(eventId)
  const resetRef = useRef<(() => void) | null>(null)
  const [canReset, setCanReset] = useState(false)

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
        Sticky, because a reviewer who zoomed in and then scrolled down the
        record section could no longer see the way out - one got lost and
        thought the app had broken. The control that undoes a state has to
        stay reachable while you are IN that state.

        The caption that used to sit here is gone: "8 channels · bandpassed in
        the browser · nearest first" told nobody anything they wanted. The
        count is countable, the distances already show the ordering, and where
        the filter ran is an implementation detail.
      */}
      <HStack
        justify="flex-end"
        wrap="wrap"
        gap="2"
        position="sticky"
        top="0"
        zIndex="1"
        bg="bg.panel"
        py="1"
      >
        <HStack gap="2">
          {/* Different bargains on different inputs, so say which. */}
          <Text fontSize="2xs" color="fg.muted" display={{ base: 'none', md: 'block' }}>
            drag to zoom · shift-scroll to zoom · shift-drag to pan
          </Text>
          <Text fontSize="2xs" color="fg.muted" display={{ base: 'block', md: 'none' }}>
            pinch to zoom · one finger scrolls
          </Text>
          <Button
            size="xs"
            variant="outline"
            disabled={!canReset}
            onClick={() => resetRef.current?.()}
          >
            <LuZoomOut /> Reset zoom
          </Button>
        </HStack>
      </HStack>

      {unfiltered.length > 0 && (
        // Named, not counted: "one channel is unfiltered" is not actionable,
        // "FOR8 is unfiltered" tells you which trace to distrust.
        <Text fontSize="xs" color="fg.muted">
          Unfiltered (no design for the sampling rate):{' '}
          {unfiltered.map((trace) => trace.channel.streamId).join(', ')}
        </Text>
      )}

      <Box height={`${traces.length * LANE_HEIGHT}px`} minH="12rem">
        <Suspense fallback={<Skeleton height="100%" rounded="md" />}>
          <WaveformChart traces={traces} originMs={originMs} onReady={onReady} />
        </Suspense>
      </Box>
    </Stack>
  )
}
