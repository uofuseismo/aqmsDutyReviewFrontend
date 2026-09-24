/**
 * Alarm actions: what the system did about this event, and to whom.
 *
 * Mail, SMS, belt pagers, ShakeMap, PDL. Read the list and you are reading
 * the answer to "has this event already left the building?" - which is the
 * question that changes what accepting or cancelling means. An event whose
 * pagers fired forty minutes ago has already reached people.
 */
export interface RawAlarm {
  /** Which database raised it - RTT for real time, PPT for post-processing. */
  database: string
  eventIdentifier: number
  /** "AWSUUSSMail", "BeltPager_SNPP", "ShakeMap", "EVTPRM2PDL". */
  action: string
  /** "COMPLETED", "ERROR". Others may exist; anything unknown is not a pass. */
  state: string
  /** Bumped when the same action ran again for a revised solution. */
  modificationCount: number
  /** Epoch SECONDS, like the station and quarry dates. */
  modificationTime: number
}

/**
 * Three outcomes, not two.
 *
 * `pending` was missing at first and `failed` meant "anything not COMPLETED",
 * which would have painted a PROCESSING alarm red for doing exactly what it
 * is supposed to be doing. An unrecognised state still counts as failed
 * though: a state this build has never met should surface rather than be
 * assumed harmless.
 */
export type AlarmState = 'completed' | 'pending' | 'cancelled' | 'failed'

export interface Alarm extends Omit<RawAlarm, 'modificationTime'> {
  time: Date
  timeMs: number
  outcome: AlarmState
  /** ERROR, or a state nobody here recognises. */
  failed: boolean
  /** Still running - worth asking again in a moment. */
  pending: boolean
}

/**
 * An alarm has four states: COMPLETED, PROCESSING, ERROR - and CANCELLED,
 * which is what the alarms of a cancelled event become. The first real
 * cancel (31156066) turned every row CANCELLED, and while this only knew
 * three, each one was reported as a failure by name in the headline.
 * Cancelled is the expected result of a decision, not something that went
 * wrong, so it is its own outcome and stays in the table.
 *
 * FINALIZED is NOT one of them - that belongs to an event's review status,
 * and briefly appeared here by my own confusion between the two. A FINALIZED
 * turning up on an alarm would now be drawn as unrecognised, which is the
 * right answer for something this build has no business seeing.
 *
 * The other pending spellings are kept as a hedge only: PROCESSING is the one
 * in use, and the rest cost nothing to accept if the vocabulary ever grows.
 */
const PENDING_STATES = ['processing', 'pending', 'queued', 'in_progress', 'running']

export function classifyState(state: string): AlarmState {
  const normalised = state.trim().toLowerCase()
  if (normalised === 'completed') return 'completed'
  if (PENDING_STATES.includes(normalised)) return 'pending'
  // Both spellings, as for the event status: which one AQMS writes has only
  // been seen once.
  if (normalised === 'cancelled' || normalised === 'canceled') return 'cancelled'
  return 'failed'
}

export function parseAlarms(rows: RawAlarm[] | null | undefined): Alarm[] {
  return (rows ?? [])
    .map((row) => {
      const outcome = classifyState(row.state)
      return {
        ...row,
        time: new Date(row.modificationTime * 1000),
        timeMs: row.modificationTime * 1000,
        outcome,
        failed: outcome === 'failed',
        pending: outcome === 'pending',
      }
    })
    // Newest first: the last thing that happened is the thing being asked about.
    .sort((a, b) => b.timeMs - a.timeMs || a.action.localeCompare(b.action))
}

export interface AlarmSummary {
  total: number
  failed: number
  pending: number
  cancelled: number
  /** Distinct actions, so "3 mails" reads as one thing that happened. */
  distinctActions: number
  /** When the first and last action ran. */
  firstMs?: number
  lastMs?: number
  /** The actions that did not complete, named. */
  failures: Alarm[]
}

export function summariseAlarms(alarms: Alarm[]): AlarmSummary {
  const failures = alarms.filter((alarm) => alarm.failed)
  const times = alarms.map((alarm) => alarm.timeMs)
  return {
    total: alarms.length,
    failed: failures.length,
    pending: alarms.filter((alarm) => alarm.pending).length,
    cancelled: alarms.filter((alarm) => alarm.outcome === 'cancelled').length,
    distinctActions: new Set(alarms.map((alarm) => alarm.action)).size,
    firstMs: times.length > 0 ? Math.min(...times) : undefined,
    lastMs: times.length > 0 ? Math.max(...times) : undefined,
    failures,
  }
}

/**
 * Whether anything has gone out to people.
 *
 * Used to warn before cancelling: if notifications have already been
 * delivered, cancelling does not unsend them.
 */
export function hasNotified(alarms: Alarm[]): boolean {
  return alarms.some((alarm) => alarm.outcome === 'completed')
}

/**
 * How a state is drawn: an icon, a colour, and the word itself.
 *
 * The word moves into the tooltip and the accessible name so the column can
 * be one glyph wide - "COMPLETED" fourteen times over was the widest thing in
 * the table and the least informative, since it is the answer on almost every
 * row. Icon AND colour, never colour alone.
 */
export type AlarmGlyph = 'check' | 'clock' | 'cancelled' | 'cross' | 'unknown'

export function alarmGlyph(alarm: Pick<Alarm, 'state' | 'outcome'>): AlarmGlyph {
  if (alarm.outcome === 'completed') return 'check'
  if (alarm.outcome === 'pending') return 'clock'
  if (alarm.outcome === 'cancelled') return 'cancelled'
  // A state nobody here recognises is drawn differently from a known failure:
  // "this went wrong" and "I do not know what this means" are not the same.
  return alarm.state.trim().toLowerCase() === 'error' ? 'cross' : 'unknown'
}

/** Anything still running, so the list is not final yet. */
export function hasPending(alarms: Alarm[]): boolean {
  return alarms.some((alarm) => alarm.pending)
}

/**
 * The sources present, in the order they started acting.
 *
 * RTT raises alarms in real time and PPT after post-processing, so ordering
 * by first activity puts them in the order they actually happened rather than
 * alphabetically.
 */
export function alarmSources(alarms: Alarm[]): string[] {
  const first = new Map<string, number>()
  for (const alarm of alarms) {
    const held = first.get(alarm.database)
    if (held === undefined || alarm.timeMs < held) first.set(alarm.database, alarm.timeMs)
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([source]) => source)
}
