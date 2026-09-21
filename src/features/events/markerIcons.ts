import { divIcon, type DivIcon } from 'leaflet'
import { pickColor, type PickStatus } from './pickPalette'

/**
 * Map markers, drawn as inline SVG rather than loaded from an image.
 *
 * Generated instead of imported so one code path serves every shape, colour
 * and theme: with three shapes x two statuses x two themes there would
 * otherwise be twelve asset files to keep in step.
 *
 * SHAPE = phase, COLOUR = residual status. See pickPalette.ts for why.
 *
 * A bright fill with a contrasting outline is what survives both tile layers -
 * a fill alone disappears against a map of roughly its own value - so the
 * outline follows the colour mode exactly as the region boundaries do.
 */
export const OUTLINE_LIGHT = '#1A1A1A'
export const OUTLINE_DARK = '#FFFFFF'

export function outlineFor(colorMode: 'light' | 'dark'): string {
  return colorMode === 'dark' ? OUTLINE_DARK : OUTLINE_LIGHT
}

/** Marker sizes in px. The origin is larger; it is the subject. */
const STATION_SIZE = 18
const ORIGIN_SIZE = 26
const ORIGIN_FILL = '#FFB81D'

/**
 * A quarry near the epicentre.
 *
 * Deliberately unlike everything else on the map. A quarry is not an
 * observation - it carries no phase and no residual - so it must not borrow
 * the shapes that mean phase or the colours that mean status. A diamond is
 * not in the station set, and this violet is not in the pick palette, so
 * neither rule is bent to make room for it.
 *
 * Slightly smaller than a station: it is context for reading the event, not a
 * measurement that constrains it.
 */
const QUARRY_SIZE = 16
const QUARRY_FILL = '#7E57C2'

/** P only, S only, or both. */
export type StationShape = 'p' | 's' | 'both'

/**
 * Icons are cached by every input that changes their appearance.
 *
 * Leaflet compares icons by identity, so a fresh object each render would
 * tear down and rebuild every marker on the map. The cache is small and
 * bounded: 3 shapes x 3 statuses x 2 themes, plus 2 origin and 2 quarry
 * variants.
 */
const cache = new Map<string, DivIcon>()

/** Points of a five-pointed star inscribed in the 100x100 box. */
function starPoints(outer = 46, inner = 18, center = 50): string {
  const points: string[] = []
  for (let i = 0; i < 10; i += 1) {
    const angle = (-90 + i * 36) * (Math.PI / 180)
    const radius = i % 2 === 0 ? outer : inner
    points.push(
      `${(center + radius * Math.cos(angle)).toFixed(2)},${(center + radius * Math.sin(angle)).toFixed(2)}`,
    )
  }
  return points.join(' ')
}

function shapeBody(shape: StationShape, fill: string, stroke: string): string {
  const TRIANGLE = '50,10 92,84 8,84'
  switch (shape) {
    case 'p':
      return `<polygon points="${TRIANGLE}" fill="${fill}" ${stroke} />`
    case 's':
      // The same triangle, turned over - rotating beats maintaining a second
      // set of points that has to stay in step with the first.
      return `<polygon points="${TRIANGLE}" fill="${fill}" ${stroke} transform="rotate(180 50 50)" />`
    case 'both':
      return `<rect x="12" y="12" width="76" height="76" fill="${fill}" ${stroke} />`
  }
}

function build(key: string, size: number, body: string): DivIcon {
  const existing = cache.get(key)
  if (existing !== undefined) return existing
  const made = divIcon({
    html: `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`,
    // Leaflet's default div-icon class paints a white box with a border,
    // which would frame every marker in a little card.
    className: '',
    iconSize: [size, size],
    // Centred on the point: these are positions, not pins.
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
  })
  cache.set(key, made)
  return made
}

/**
 * A quarry marker: a diamond.
 *
 * A pickaxe would say "quarry" more literally, but at 16px a pickaxe is four
 * grey pixels and a suggestion. The diamond survives the size, and the
 * tooltip carries the name and the distance.
 */
export function quarryIcon(outline: string): DivIcon {
  const stroke = `stroke="${outline}" stroke-width="8" stroke-linejoin="round"`
  return build(
    `quarry:${outline}`,
    QUARRY_SIZE,
    `<polygon points="50,6 94,50 50,94 6,50" fill="${QUARRY_FILL}" ${stroke} />`,
  )
}

export function originIcon(outline: string): DivIcon {
  const stroke = `stroke="${outline}" stroke-width="7" stroke-linejoin="round"`
  return build(
    `star:${outline}`,
    ORIGIN_SIZE,
    `<polygon points="${starPoints()}" fill="${ORIGIN_FILL}" ${stroke} />`,
  )
}

/**
 * Which shape a station earns, from the phases picked there.
 *
 * A station with both P and S constrains distance far better than one with a
 * single phase, so the three cases are worth telling apart at a glance when
 * judging whether the geometry supports a solution.
 */
export function shapeForPhases(phases: string[]): StationShape {
  const upper = phases.map((phase) => phase.trim().toUpperCase())
  const hasP = upper.some((phase) => phase.startsWith('P'))
  const hasS = upper.some((phase) => phase.startsWith('S'))
  if (hasP && hasS) return 'both'
  // Anything unrecognised is treated as P, matching how the residual
  // threshold holds an unknown phase to the stricter P limit.
  return hasS && !hasP ? 's' : 'p'
}

export function stationIcon(
  shape: StationShape,
  status: PickStatus,
  outline: string,
): DivIcon {
  const fill = pickColor(status)
  const stroke = `stroke="${outline}" stroke-width="7" stroke-linejoin="round"`
  return build(`${shape}:${status}:${outline}`, STATION_SIZE, shapeBody(shape, fill, stroke))
}
