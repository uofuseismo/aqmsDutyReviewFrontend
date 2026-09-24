import { ApiError, apiPost } from '../../api/client'
import type { EventDetail } from './eventDetail'

/**
 * The two ways a review ends.
 *
 * `accept` promotes the solution; `cancel` rejects the event. Both are POSTs
 * to /events/<eventId>/<verb>.
 */
export type EventAction = 'accept' | 'cancel'

/**
 * The solution the analyst was looking at, sent with every action.
 *
 * Analysts leave this app mid-review to repick in the processing tool and
 * come back to accept. That save makes a new origin WITHOUT bumping the
 * event version, so the backend cannot tell from the event alone whether the
 * decision was made about what is there now. It compares these three with
 * the database - under a row lock, for accept - and answers 409 if any has
 * moved, rather than promoting a solution nobody reviewed.
 */
export interface ExpectedSolution {
  expectedPreferredOriginId: number | null
  /** Null for an event with no preferred magnitude; null matches only null. */
  expectedPreferredMagnitudeId: number | null
  /**
   * The name exactly as the detail route sent it - "earthquake",
   * "quarry_blast" - never the database code and never the label on screen.
   * The backend parses it strictly: anything else is a 400.
   */
  expectedEventType: string
}

/**
 * What the analyst saw, from the loaded detail.
 *
 * The RAW preferred identifiers, not `detail.preferredOrigin.id`: that one
 * falls back to the first origin when the preferred is missing from the
 * list, and sending it would claim the analyst reviewed something the event
 * never pointed at. Undefined when there is no detail to vouch for - the
 * caller must not act at all then.
 */
export function expectedSolutionOf(detail: EventDetail | null): ExpectedSolution | undefined {
  if (detail === null || detail.eventType === undefined) return undefined
  return {
    expectedPreferredOriginId: detail.preferredOriginId ?? null,
    expectedPreferredMagnitudeId: detail.preferredMagnitudeId ?? null,
    expectedEventType: detail.eventType,
  }
}

/**
 * The backend refused because the event moved on since it was loaded.
 * Its message says so; the caller should also reload what it is showing.
 */
export function isSolutionChanged(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 409
}

export async function submitEventAction(
  action: EventAction,
  eventId: number,
  expected: ExpectedSolution,
  token: string | null,
  signal?: AbortSignal,
): Promise<string> {
  /*
    apiPost merges the envelope's `message` INTO the object it returns - see
    the end of apiPost - so the route's own wording arrives as `reply.message`,
    not as the reply itself. Reading it lets the backend phrase its own
    confirmation instead of being paraphrased here; the fallback covers a route
    that says nothing.
  */
  const reply = await apiPost<{ message?: string }>(
    `/events/${eventId}/${action}`,
    { ...expected },
    token,
    signal,
  )
  const message = reply?.message
  if (typeof message === 'string' && message.trim() !== '') return message.trim()
  return action === 'accept' ? 'Event accepted.' : 'Event cancelled.'
}

/**
 * The states in which an action repeats something already done.
 *
 * Both spellings of cancelled are accepted. No sample payload has ever
 * carried this status - the four seen are automatic, incomplete, human and
 * finalized - so which spelling the backend emits is unknown, and guessing
 * one would make the confirmation silently never appear.
 */
const ALREADY: Record<EventAction, readonly string[]> = {
  accept: ['finalized'],
  cancel: ['cancelled', 'canceled'],
}

export interface Confirmation {
  title: string
  body: string
  /** The button that goes through with it. */
  proceed: string
}

/**
 * What to ask before doing this, or null to just do it.
 *
 * Friction only where it is earned: repeating an action the event has already
 * been through is either a slip or a deliberate decision, and a question
 * separates the two. Accepting an unreviewed event, or cancelling a live one,
 * asks nothing - those are the job.
 */
export function confirmationFor(
  action: EventAction,
  reviewStatus: string,
  eventId: number,
): Confirmation | null {
  const status = reviewStatus.trim().toLowerCase()
  if (!ALREADY[action].includes(status)) return null
  return action === 'accept'
    ? {
        title: 'Accept an already finalized event?',
        body: `Event ${eventId} has been reviewed and signed off already. Accepting it again promotes the current solution over that one.`,
        proceed: 'Accept anyway',
      }
    : {
        title: 'Cancel an already cancelled event?',
        body: `Event ${eventId} has already been cancelled. Cancelling it again will not undo anything - if you meant to bring it back, this is not the button.`,
        proceed: 'Cancel anyway',
      }
}
