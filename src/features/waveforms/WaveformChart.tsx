import {
  Chart,
  Decimation,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { useEffect, useRef } from 'react'
import { useColorMode } from '../../components/ui/useColorMode'
import { arrivalResidualLevel } from '../events/eventDetail'
import { waveformPickColor, waveformTraceInk } from '../events/pickPalette'
import { formatTick, chooseStepMs, timeTicks } from './timeTicks'
import {
  TRACE_HALF_HEIGHT,
  laneY,
  recordSectionExtent,
  segmentPoints,
  type Trace,
} from './waveforms'

Chart.register(LineController, LineElement, PointElement, LinearScale, Decimation, Filler, zoomPlugin)

/** Clearance between a lane label's baseline and the top of its trace. */
const LABEL_GAP_PX = 4

/**
 * Space above the top trace and below the bottom one, in lanes.
 *
 * TRACE_HALF_HEIGHT for the trace itself, plus room for the label above it.
 */
const LANE_HEADROOM = TRACE_HALF_HEIGHT + 0.2

/** How close two zoom limits may get: a tenth of a second fills the width. */
const MIN_RANGE_MS = 100

export interface WaveformChartProps {
  traces: Trace[]
  /** Origin time, drawn as a reference line if it falls in the window. */
  originMs?: number
  /** Called with a reset function once the chart exists. */
  onReady?: (reset: () => void) => void
}

/**
 * A record section: one trace per lane, nearest station at the top.
 *
 * Chart.js rather than a wrapper library, because the chart is built once
 * from data that does not change while it is on screen, and the imperative
 * instance is easier to reason about than a component that rebuilds options
 * on every render.
 */
export function WaveformChart({ traces, originMs, onReady }: WaveformChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { colorMode } = useColorMode()
  const mode: 'light' | 'dark' = colorMode === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    const canvas = canvasRef.current
    const extent = recordSectionExtent(traces)
    if (canvas === null || extent === null) return

    /*
      The tick step, chosen once per layout in afterBuildTicks and read back
      by the label callback. Both have to agree: the step decides whether a
      label carries tenths, and computing it twice from different inputs is
      how an axis ends up labelled 18:59:20.0, 18:59:30.0 at ten-second steps.
    */
    let tickStepMs = chooseStepMs(extent.maxMs - extent.minMs, 8)

    const traceInk = waveformTraceInk(mode)
    const gridInk = mode === 'dark' ? '#3A3A3A' : '#E4E4E7'
    const labelInk = mode === 'dark' ? '#A1A1AA' : '#52525B'
    const originInk = mode === 'dark' ? '#71717A' : '#A1A1AA'

    const datasets = traces.flatMap((trace) =>
      trace.channel.segments.map((segment) => ({
        data: segmentPoints(segment, trace.lane, trace.channel.peak),
        borderColor: traceInk,
        borderWidth: 0.8,
        pointRadius: 0,
        tension: 0,
        // Segments are separate datasets so a real gap in the record stays a
        // gap instead of being bridged by a straight line that never happened.
        spanGaps: false,
      })),
    )

    /**
     * Picks, the origin time, and each lane's label.
     *
     * One plugin rather than extra datasets: a pick is an annotation on the
     * trace, not data on the same axis, and drawing it directly avoids
     * feeding two-point series through the decimation path.
     */
    const overlay: Plugin<'line'> = {
      id: 'waveform-overlay',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart
        const x = scales.x
        const y = scales.y
        ctx.save()
        ctx.beginPath()
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top)
        ctx.clip()

        if (originMs !== undefined && originMs >= x.min && originMs <= x.max) {
          const px = x.getPixelForValue(originMs)
          ctx.strokeStyle = originInk
          ctx.lineWidth = 1
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(px, chartArea.top)
          ctx.lineTo(px, chartArea.bottom)
          ctx.stroke()
          ctx.setLineDash([])
          // Labelled at the FOOT of the line: the top is where the first
          // lane's pick label sits, and on a shallow local event the origin
          // and the nearest P are a fraction of a second apart.
          ctx.font = '10px system-ui, sans-serif'
          ctx.fillStyle = originInk
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          ctx.fillText('origin', px + 3, chartArea.bottom - 3)
        }

        for (const trace of traces) {
          const centre = laneY(trace.lane)
          const top = y.getPixelForValue(centre + TRACE_HALF_HEIGHT)
          const bottom = y.getPixelForValue(centre - TRACE_HALF_HEIGHT)

          for (const arrival of trace.arrivals) {
            if (arrival.timeMs < x.min || arrival.timeMs > x.max) continue
            const px = x.getPixelForValue(arrival.timeMs)
            const ink = waveformPickColor(
              arrival.phase,
              arrivalResidualLevel(arrival),
              mode,
              trace.mixedPhases,
            )
            ctx.strokeStyle = ink
            // Solid, always. A dashed pick is reserved for theoretical
            // arrivals, and these are somebody's actual picks.
            ctx.lineWidth = 1.75
            ctx.beginPath()
            ctx.moveTo(px, top)
            ctx.lineTo(px, bottom)
            ctx.stroke()
            ctx.font = '600 11px system-ui, sans-serif'
            ctx.fillStyle = ink
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(arrival.phase, px + 3, top + 2)
          }

          /*
            The lane's identity, over the trace rather than in a legend: with
            six or thirty lanes, a legend is a lookup and this is not.

            Drawn in the GAP ABOVE the lane, which is the one horizontal band
            a pick line never enters - pick lines span the trace's own height
            and stop there. Placing it by x instead, and shortening it when a
            pick was in the way, still collided whenever a pick sat near the
            left edge: at that point no text is short enough. Separating them
            by y makes the collision impossible rather than unlikely.
          */
          ctx.font = '11px ui-monospace, monospace'
          ctx.fillStyle = labelInk
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          const distance =
            trace.distanceKm === undefined ? '' : `  ${trace.distanceKm.toFixed(1)} km`
          ctx.fillText(`${trace.channel.streamId}${distance}`, chartArea.left + 4, top - LABEL_GAP_PX)
        }
        ctx.restore()
      },
    }

    const options: ChartOptions<'line'> = {
      parsing: false,
      normalized: true,
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      // Nothing here is hoverable yet, and hit-testing 73 000 points to decide
      // that costs real time on a phone.
      events: [],
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        // min-max, never LTTB: on a seismogram the peak amplitude IS the
        // signal, and LTTB is free to drop the very sample an analyst is
        // looking for. min-max keeps the envelope.
        decimation: { enabled: true, algorithm: 'min-max' },
        zoom: {
          limits: { x: { min: extent.minMs, max: extent.maxMs, minRange: MIN_RANGE_MS } },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: 'shift',
            /*
              The modifier key is a MOUSE-only guard inside the plugin - its
              enabler checks `pointerType === 'mouse'` before consulting it -
              so on a phone a single finger would pan, and a record section
              that pans under your thumb is a record section you cannot
              scroll past. One finger belongs to the page; two belong to the
              chart, which is the same bargain a map makes.
            */
            onPanStart: ({ event }) => {
              const touch = event?.srcEvent as PointerEvent | undefined
              if (touch !== undefined && touch.pointerType !== 'mouse') {
                return (event?.pointers?.length ?? 1) >= 2
              }
              return true
            },
          },
          zoom: {
            /*
              SHIFT to zoom, so a plain wheel still scrolls the page.

              A record section is tall and sits mid-page; an unmodified wheel
              over it zoomed the time axis instead of moving the document,
              which reads as the page having seized. The plugin checks the
              modifier BEFORE calling preventDefault, so without shift the
              wheel event is left alone and the page scrolls normally.

              Shift is already the pan modifier here, so it is one key to
              remember rather than two.
            */
            wheel: { enabled: true, modifierKey: 'shift' },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: 'rgba(120,120,120,0.15)' },
            mode: 'x',
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: extent.minMs,
          max: extent.maxMs,
          grid: { color: gridInk },
          border: { color: gridInk },
          ticks: {
            color: labelInk,
            maxRotation: 0,
            autoSkip: false,
            font: { size: 10 },
            callback: (value) => formatTick(Number(value), tickStepMs),
          },
          afterBuildTicks: (axis) => {
            // About 90px per label: a phone gets three or four ticks, a wide
            // desktop gets ten, and neither ends up with times touching.
            const target = Math.max(3, Math.min(10, Math.floor((axis.width || 600) / 90)))
            tickStepMs = chooseStepMs(axis.max - axis.min, target)
            axis.ticks = timeTicks(axis.min, axis.max, target).map((value) => ({ value }))
          },
        },
        y: {
          type: 'linear',
          /*
            Headroom sized to what is DRAWN there, not to a round number.
            The top lane's label sits about 15px above its trace, which at
            LANE_HEIGHT is 0.16 of a lane on top of the trace's own 0.42 - so
            half a lane clipped it. The foot carries the origin label and gets
            the same allowance.
          */
          min: laneY(traces.length - 1) - LANE_HEADROOM,
          max: laneY(0) + LANE_HEADROOM,
          display: false,
          grid: { display: false },
        },
      },
    }

    const chart = new Chart(canvas, { type: 'line', data: { datasets }, options, plugins: [overlay] })

    /*
      Hand vertical scrolling back to the page.

      chartjs-plugin-zoom drives touch through Hammer, which creates a
      pan-in-all-directions recogniser and therefore computes
      `touch-action: none` on the canvas. That is what makes the chart a dead
      zone for scrolling: a finger landing anywhere on it can never move the
      page. `pan-y` says the browser owns vertical gestures - so a swipe
      scrolls - while horizontal and multi-touch gestures are still delivered
      here for zooming.

      Set after construction and with `important`, because Hammer writes the
      inline style itself when the manager starts.
    */
    canvas.style.setProperty('touch-action', 'pan-y', 'important')
    onReady?.(() => chart.resetZoom())
    return () => chart.destroy()
  }, [traces, originMs, mode, onReady])

  return <canvas ref={canvasRef} aria-label="Waveform record section" role="img" />
}
