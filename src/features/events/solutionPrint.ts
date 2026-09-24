import type { EventDetail } from './eventDetail'
import { humanize } from './format'

/**
 * The three things an accept or cancel vouches for - the same three the
 * backend checks before acting. See ExpectedSolution in eventActions.
 *
 * Not the version: saving a light repick in the processing tool makes a new
 * origin WITHOUT bumping it, so it would miss the case this exists for.
 */
export interface SolutionPrint {
  originId?: number
  magnitudeId?: number
  eventType?: string
}

export function printOf(detail: EventDetail | null): SolutionPrint | undefined {
  if (detail === null) return undefined
  return {
    originId: detail.preferredOriginId,
    magnitudeId: detail.preferredMagnitudeId,
    eventType: detail.eventType,
  }
}

export function samePrint(a: SolutionPrint, b: SolutionPrint): boolean {
  return a.originId === b.originId && a.magnitudeId === b.magnitudeId && a.eventType === b.eventType
}

const orNone = (id: number | undefined) => (id === undefined ? 'none' : String(id))

/** "preferred origin 7978 → 152999; type quarry blast → earthquake" */
export function describeChange(from: SolutionPrint, to: SolutionPrint): string {
  const parts: string[] = []
  if (from.originId !== to.originId) {
    parts.push(`preferred origin ${orNone(from.originId)} → ${orNone(to.originId)}`)
  }
  if (from.magnitudeId !== to.magnitudeId) {
    parts.push(`preferred magnitude ${orNone(from.magnitudeId)} → ${orNone(to.magnitudeId)}`)
  }
  if (from.eventType !== to.eventType) {
    parts.push(`type ${humanize(from.eventType)} → ${humanize(to.eventType)}`.toLowerCase())
  }
  return parts.join('; ')
}
