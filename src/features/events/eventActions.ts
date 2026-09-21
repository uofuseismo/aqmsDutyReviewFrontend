import { apiPost } from '../../api/client'

/**
 * The two ways a review ends.
 *
 * `accept` promotes the solution; `cancel` rejects the event. Both are POSTs
 * to /events/<eventId>/<verb>.
 * The body is the empty envelope apiPost always sends: the event is named in
 * the path, so there is nothing else to say.
 */
export type EventAction = 'accept' | 'cancel'

export async function submitEventAction(
  action: EventAction,
  eventId: number,
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
    {},
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
