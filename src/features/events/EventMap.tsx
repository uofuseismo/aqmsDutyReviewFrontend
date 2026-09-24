import 'leaflet/dist/leaflet.css'
// After Leaflet's own sheet, and in the same lazy chunk, so the override
// travels with the thing it overrides.
import './mapAttribution.css'
import { Box, Text } from '@chakra-ui/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  LayersControl,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { useColorMode } from '../../components/ui/useColorMode'
import { originIcon, outlineFor, quarryIcon, stationIcon, type StationShape } from './markerIcons'
import type { PickStatus } from './pickPalette'
import type { Origin } from './eventDetail'
import { DRAWN_REGIONS } from './regions'

/**
 * Stadia's raster tiles: the street map in the reader's theme, or imagery.
 *
 * Attribution is a licence condition, not decoration - Stadia, OpenMapTiles
 * and OpenStreetMap all require it, and the imagery adds its own providers,
 * which Stadia asks to be named first.
 */
const STREET_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const SATELLITE_ATTRIBUTION =
  '&copy; CNES, Distribution Airbus DS, &copy; Airbus DS, &copy; PlanetObserver ' +
  '(Contains Copernicus Data) | ' +
  STREET_ATTRIBUTION

export type Basemap = 'map' | 'satellite'

/** The names in the layers control, and how baselayerchange reports them. */
const MAP_LABEL = 'Map'
const SATELLITE_LABEL = 'Satellite'

function tileUrl(basemap: Basemap, dark: boolean, key: string | undefined): string {
  const suffix = key ? `?api_key=${encodeURIComponent(key)}` : ''
  if (basemap === 'satellite') {
    // JPEG, unlike the street styles: imagery does not compress as PNG.
    return `https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg${suffix}`
  }
  const style = dark ? 'alidade_smooth_dark' : 'alidade_smooth'
  return `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png${suffix}`
}

/**
 * Tells the map which base layer the reader picked in the layers control.
 *
 * Leaflet owns the choice - the control adds and removes the tile layers
 * itself - so this only listens, for the one thing React needs to know: which
 * ink the markers should be drawn in.
 */
function BasemapWatcher({ onChange }: { onChange: (basemap: Basemap) => void }) {
  useMapEvents({
    baselayerchange: (event) => onChange(event.name === SATELLITE_LABEL ? 'satellite' : 'map'),
  })
  return null
}

/**
 * Keeps Leaflet's idea of its own size honest.
 *
 * Leaflet measures its container once and then only on a window resize. When
 * the map shares a flex row that reflows - the split layout collapsing to a
 * stack, a scrollbar appearing - the container changes size without the
 * window doing anything, and the map goes on painting into the old box: grey
 * bands down one edge, clicks landing in the wrong place.
 */
function ResizeWatcher() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])
  return null
}

/**
 * Frames the event and its stations, once the map has a size to frame them in.
 *
 * Two things were wrong with doing this during render.
 *
 * The map lives inside a Steps panel, and Chakra keeps the inactive panels
 * mounted but hidden - so the container is 0x0 while another step is showing,
 * and `fitBounds` against a zero-sized map computes a nonsense centre. That is
 * the "opens somewhere strange" on switching steps. It later corrected itself
 * only by accident: the locks poll re-rendered the tree, and fitBounds ran
 * again now that the panel was visible. Hence "wait a few seconds".
 *
 * The same accident had a second effect - every one of those re-renders threw
 * away whatever the reviewer had zoomed or panned to.
 *
 * So: fit in an effect, keyed on the bounds themselves, and only once the
 * container actually has a size. If it has none yet, watch until it does.
 */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds === null) return
    const container = map.getContainer()
    const fit = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return false
      // Leaflet cached the zero size while the panel was hidden; tell it
      // otherwise before asking it to frame anything.
      map.invalidateSize({ animate: false })
      // padded so markers are not pinned against the edge of the frame
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 })
      return true
    }
    if (fit()) return
    const observer = new ResizeObserver(() => {
      if (fit()) observer.disconnect()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [map, bounds])
  return null
}

/**
 * One thing to draw at a station's position.
 *
 * The map takes these rather than arrivals so the same component serves the
 * Location step, where shape carries the phase, and the Magnitude step, where
 * there is no phase to carry and every marker is a triangle. Whoever owns the
 * data decides what the marker means; the map only draws it.
 */
export interface MapStation {
  key: string
  latitude: number
  longitude: number
  shape: StationShape
  status: PickStatus
  tooltip: ReactNode
  /**
   * The marker's accessible name, as plain text.
   *
   * Leaflet makes every marker `tabindex="0" role="button"`, so each one is a
   * tab stop that a screen reader announces. A divIcon carries no name of its
   * own - Leaflet's `alt` option only applies to <img> icons - so without this
   * they read as seven unlabelled buttons. Separate from `tooltip` because
   * that is rich markup, and a name has to be a string.
   */
  label: string
}

/**
 * Labels a marker once it is on the map.
 *
 * `aria-label` rather than Leaflet's `title` option: `title` would give the
 * marker a native browser tooltip on top of the Leaflet one it already has,
 * which is two tooltips for one hover.
 */
function nameMarker(marker: { getElement: () => HTMLElement | undefined }, label: string) {
  marker.getElement()?.setAttribute('aria-label', label)
}

/** A quarry to mark, with how far it is from the origin. */
export interface MapQuarry {
  name: string
  latitude: number
  longitude: number
  distanceKm: number
}

export interface EventMapProps {
  origin: Pick<Origin, 'latitude' | 'longitude' | 'depthKm'>
  stations: MapStation[]
  /**
   * Quarries near the epicentre. Only the location map passes these - the
   * magnitude map is about station amplitudes, where a quarry says nothing.
   */
  quarries?: MapQuarry[]
  /** Observations that could not be placed, reported under the map. */
  unplacedCount?: number
  stadiaMapKey?: string
  height?: string
  /** Reporting regions are drawn unless this is false. */
  showRegions?: boolean
  /**
   * Offer satellite imagery. The location map does: imagery answers "is
   * that a pit?" beside a quarry marker in a way no street map can. The
   * magnitude map is about amplitudes at stations, and gains nothing.
   */
  allowSatellite?: boolean
}

/**
 * The event and the stations that picked it.
 *
 * Deliberately not every station in the network: the question this answers is
 * "does the geometry of these picks support this location?", and 300 dots
 * across five states would bury the dozen that matter. Lines from the
 * epicentre to each station make the azimuthal coverage - and therefore the
 * gap - visible at a glance, which is the thing a number in a table cannot
 * show.
 */
export function EventMap({
  origin,
  stations,
  quarries = [],
  unplacedCount = 0,
  stadiaMapKey,
  height = '20rem',
  showRegions = true,
  allowSatellite = false,
}: EventMapProps) {
  const { colorMode } = useColorMode()
  /*
    Always opens on the street map, and forgets the choice with the map.

    Imagery is for scrutinising one event - is that a pit beside the quarry
    marker? - not a way to work. Remembering it would leave the next event,
    and the one after, on imagery nobody asked for.
  */
  const [basemap, setBasemap] = useState<Basemap>('map')
  // Markers and region boundaries share one ink, so the map reads as one
  // drawing rather than two overlays that happen to sit on the same tiles.
  //
  // Imagery takes the DARK ink whatever the theme: it is mostly dark greens
  // and browns, and the light theme's near-black outline all but vanishes on
  // it, which is the same failure the dark street map had.
  const outline = outlineFor(basemap === 'satellite' ? 'dark' : colorMode)

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: [number, number][] = [
      [origin.latitude, origin.longitude],
      ...stations.map((s): [number, number] => [s.latitude, s.longitude]),
    ]
    return points.length > 1 ? points : null
  }, [origin, stations])

  return (
    <Box display="flex" flexDirection="column" height={height === '100%' ? '100%' : undefined} minH="0">
      <Box
        height={height === '100%' ? '100%' : height}
        flex={height === '100%' ? '1' : undefined}
        minH="0" 
        rounded="lg"
        overflow="hidden"
        borderWidth="1px"
        // Leaflet paints its own panes; without an explicit stacking context
        // its controls can sit above the app's sticky header.
        position="relative"
        zIndex="0"
      >
        <MapContainer
          center={[origin.latitude, origin.longitude]}
          zoom={9}
          /*
            Wheel zoom is on. The cost is that a wheel gesture over the map
            zooms instead of scrolling the page past it - if that becomes
            irritating on a long review screen, Leaflet can require a
            modifier key instead of switching it off entirely.
          */
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          {/*
            The basemap choice: Leaflet's own layers control, stacked under the
            zoom buttons - the stacked-layers icon opens a list with a radio
            mark on the current one. A pair of Map | Satellite buttons was
            tried first and read ambiguously: with two options side by side,
            which one is "on" is a guess.

            Each layer carries its own attribution, and Leaflet swaps it as
            the layers are swapped.
          */}
          {allowSatellite ? (
            <LayersControl position="topleft">
              <LayersControl.BaseLayer name={MAP_LABEL} checked>
                <TileLayer
                  attribution={STREET_ATTRIBUTION}
                  url={tileUrl('map', colorMode === 'dark', stadiaMapKey)}
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name={SATELLITE_LABEL}>
                <TileLayer
                  attribution={SATELLITE_ATTRIBUTION}
                  url={tileUrl('satellite', false, stadiaMapKey)}
                />
              </LayersControl.BaseLayer>
            </LayersControl>
          ) : (
            <TileLayer
              attribution={STREET_ATTRIBUTION}
              url={tileUrl('map', colorMode === 'dark', stadiaMapKey)}
            />
          )}
          {allowSatellite && <BasemapWatcher onChange={setBasemap} />}
          <FitBounds bounds={bounds} />
          <ResizeWatcher />

          {/*
            Outlines only - no fill. A tinted area over a map reads as though
            it means something about the ground inside it, when all these
            boundaries say is where the edge is. The edge is the useful part:
            it answers "is this event near the limit of the network?".

            They deliberately do NOT influence the fitted bounds - framing a
            region hundreds of km across would shrink the event to a dot - and
            containment is stated in words above the map, which stays legible
            at any zoom.
          */}
          {showRegions &&
            DRAWN_REGIONS.map((region) => (
              <Polygon
                key={region.id}
                positions={region.ring as [number, number][]}
                pathOptions={{
                  /*
                    One thin solid line for every region, in the same ink as
                    the marker outlines. A fixed black would all but vanish
                    against the dark tiles, so it follows the colour mode.
                  */
                  color: outline,
                  weight: 1,
                  opacity: 0.75,
                  fill: false,
                }}
              >
                <Tooltip sticky>{region.name}</Tooltip>
              </Polygon>
            ))}

          {stations.map((station) => (
            <Polyline
              key={`ray-${station.key}`}
              positions={[
                [origin.latitude, origin.longitude],
                [station.latitude, station.longitude],
              ]}
              pathOptions={{ color: '#708E99', weight: 1, opacity: 0.5 }}
            />
          ))}

          {/*
            SHAPE is the phase: triangle for P only, the same triangle turned
            over for S only, square for a station carrying both. COLOUR is the
            residual: blue is fine, red wants looking at. Keeping the two on
            separate channels means neither has to give way to the other, and
            colour can go on meaning the same thing in the table and later on
            the waveforms.
          */}
          {stations.map((station) => (
            <Marker
              key={station.key}
              position={[station.latitude, station.longitude]}
              icon={stationIcon(station.shape, station.status, outline)}
              eventHandlers={{ add: (event) => nameMarker(event.target, station.label) }}
            >
              <Tooltip>{station.tooltip}</Tooltip>
            </Marker>
          ))}

          {/*
            Quarries under the stations and the origin: they are context for
            reading the event, and must never hide an observation.

            They deliberately do NOT influence the fitted bounds, for the same
            reason the region outlines do not - a quarry 15 km away would pull
            the frame wider and shrink the thing being reviewed.
          */}
          {quarries.map((quarry) => (
            <Marker
              key={`quarry:${quarry.name}:${quarry.latitude},${quarry.longitude}`}
              position={[quarry.latitude, quarry.longitude]}
              icon={quarryIcon(outline)}
              eventHandlers={{
                add: (event) =>
                  nameMarker(
                    event.target,
                    `Quarry ${quarry.name}, ${quarry.distanceKm.toFixed(1)} km from the epicentre`,
                  ),
              }}
            >
              <Tooltip>
                <strong>{quarry.name}</strong>
                <br />
                Quarry · {quarry.distanceKm.toFixed(1)} km from the epicentre
              </Tooltip>
            </Marker>
          ))}

          {/* Last, and lifted above the station markers: it is the subject. */}
          <Marker
            position={[origin.latitude, origin.longitude]}
            icon={originIcon(outline)}
            zIndexOffset={1000}
            eventHandlers={{
              add: (event) =>
                nameMarker(
                  event.target,
                  `Epicenter, ${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)}, depth ${origin.depthKm.toFixed(2)} km`,
                ),
            }}
          >
            <Tooltip>
              <strong>Epicenter</strong>
              <br />
              {origin.latitude.toFixed(4)}, {origin.longitude.toFixed(4)}
              <br />
              {origin.depthKm.toFixed(2)} km deep
            </Tooltip>
          </Marker>
        </MapContainer>
      </Box>
      {unplacedCount > 0 && (
        <Text fontSize="xs" color="fg.muted" pt="1">
          {unplacedCount} could not be placed - no station record.
        </Text>
      )}
    </Box>
  )
}
