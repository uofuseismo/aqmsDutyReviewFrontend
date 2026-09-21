import type { Magnitude, Origin, StationMagnitude } from './eventDetail'

/**
 * The rules an event must satisfy to be accepted automatically.
 *
 * These are the analysts' rules, not the app's: they decide what a solution
 * has to look like before nobody needs to read it. Stated here once, as data,
 * so the Location and Magnitude steps show the same judgement rather than two
 * re-implementations that drift.
 *
 * Nothing here accepts anything. It reports which rules a solution meets, so
 * a reviewer can see at a glance whether this is the routine case or the one
 * that needs them.
 */
export interface Criterion {
  id: string
  /** Short enough for a dense bar: "Gap", "wRMSE". */
  label: string
  /** The measured value, formatted, or undefined when there is none. */
  value?: string
  /**
   * The whole tooltip, in one short sentence.
   *
   * Phrased as the REQUIREMENT, never as a claim about the value: "needs to
   * be under 0.5 s" rather than "exceeds 0.5". The second is wrong at the
   * boundary - 0.5 does not exceed 0.5 but does fail "< 0.5" - and saying
   * what is needed sidesteps that entirely while telling the reviewer the
   * thing they actually want to know.
   */
  tip: string
  /**
   * - `pass`    the rule is met
   * - `fail`    the rule is broken
   * - `warn`    the solution is fine, but policy says a human must handle it
   * - `unknown` the payload does not carry what the rule needs, or the rule
   *             does not apply here. NOT a pass: a missing number cannot
   *             satisfy anything.
   */
  verdict: Verdict
}

export type Verdict = 'pass' | 'fail' | 'warn' | 'unknown'

/** "Under 0.5 s" when it holds, "Needs to be under 0.5 s" when it does not. */
function requirement(verdict: Verdict, phrase: string, missing: string): string {
  if (verdict === 'unknown') return missing
  return verdict === 'pass' ? capitalise(phrase) : `Needs to be ${phrase.toLowerCase()}`
}

/** Boolean rules, where absent means undecidable. */
function verdictOf(value: number | undefined, met: (value: number) => boolean): Verdict {
  if (value === undefined) return 'unknown'
  return met(value) ? 'pass' : 'fail'
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const LOCATION_RULES = {
  /** Weighted RMS residual, seconds. */
  maxWeightedRms: 0.5,
  /** Largest azimuthal hole, degrees. Inclusive: exactly 180 passes. */
  maxGap: 180,
  /** Defining phases. */
  minPhases: 10,
} as const

export function locationCriteria(origin: Origin): Criterion[] {
  const rms = origin.weightedRootMeanSquaredError
  const gap = origin.maximumAzimuthalGap
  const phases = origin.numberOfDefiningPhases
  const rmsPass = verdictOf(rms, (v) => v < LOCATION_RULES.maxWeightedRms)
  const gapPass = verdictOf(gap, (v) => v <= LOCATION_RULES.maxGap)
  const phasePass = verdictOf(phases, (v) => v >= LOCATION_RULES.minPhases)
  const absent = 'Not reported for this origin'
  return [
    {
      id: 'wrmse',
      label: 'wRMSE',
      value: rms === undefined ? undefined : `${rms.toFixed(2)} s`,
      verdict: rmsPass,
      tip: requirement(rmsPass, `under ${LOCATION_RULES.maxWeightedRms} s`, absent),
    },
    {
      id: 'gap',
      label: 'Gap',
      value: gap === undefined ? undefined : `${gap.toFixed(0)}°`,
      verdict: gapPass,
      tip: requirement(gapPass, `${LOCATION_RULES.maxGap}° or less`, absent),
    },
    {
      id: 'phases',
      label: 'Defining phases',
      value: phases === undefined ? undefined : String(phases),
      verdict: phasePass,
      tip: requirement(phasePass, `${LOCATION_RULES.minPhases} or more`, absent),
    },
  ]
}

export const MAGNITUDE_RULES = {
  /** How far a local and a duration magnitude may sit apart. */
  maxTypeDifference: 0.5,
  /** A station magnitude residual this size or larger is not "good". */
  maxStationResidual: 1,
  /** The share of counted stations that must be good. */
  minGoodFraction: 0.9,
  /**
   * A local magnitude above this has to be handled by a person.
   *
   * Not a quality failure - the solution can be perfectly good - so it is a
   * WARNING rather than a cross. It is a rule about who does the work, and an
   * event this size is one somebody will be asked about.
   */
  manualReviewAboveLocal: 3.5,
  /**
   * Only these networks count.
   *
   * The rule is about how well OUR network agrees with itself; a borrowed
   * station from elsewhere is not evidence either way.
   */
  networks: ['UU', 'WY'],
} as const

function counts(magnitude: Magnitude): { counted: StationMagnitude[]; good: StationMagnitude[] } {
  const counted = magnitude.stationMagnitudes.filter(
    (sm) =>
      (MAGNITUDE_RULES.networks as readonly string[]).includes(sm.network.trim().toUpperCase()) &&
      sm.residual !== undefined,
  )
  const good = counted.filter(
    (sm) => Math.abs(sm.residual ?? 0) < MAGNITUDE_RULES.maxStationResidual,
  )
  return { counted, good }
}

/** The first magnitude of a given type, by the payload's own naming. */
function ofType(origin: Origin, type: string): Magnitude | undefined {
  return origin.magnitudes.find(
    (m) => (m.type ?? m.kind ?? '').toLowerCase().includes(type) && m.value !== undefined,
  )
}

export function magnitudeCriteria(origin: Origin): Criterion[] {
  const local = ofType(origin, 'local')
  const duration = ofType(origin, 'duration')

  /*
    Only applies when BOTH exist. One magnitude cannot disagree with a
    magnitude that was never computed, so a lone Md is "not applicable"
    rather than a failure.
  */
  const bothPresent = local?.value !== undefined && duration?.value !== undefined
  const difference = bothPresent ? Math.abs(local!.value! - duration!.value!) : undefined

  const agreementPass = verdictOf(
    difference,
    (v) => v < MAGNITUDE_RULES.maxTypeDifference,
  )

  const localValue = local?.value
  const needsPerson =
    localValue !== undefined && localValue > MAGNITUDE_RULES.manualReviewAboveLocal

  const criteria: Criterion[] = [
    {
      /*
        First in the row, because it outranks the rest: whatever the residuals
        look like, an event this size is not going through on its own.
      */
      id: 'manual-review',
      label: 'Ml',
      value: localValue === undefined ? undefined : localValue.toFixed(2),
      verdict: localValue === undefined ? 'unknown' : needsPerson ? 'warn' : 'pass',
      /*
        "3.5 or less" rather than "under 3.5": the threshold is exclusive, so
        an Ml of exactly 3.5 passes and is not under 3.5. Same boundary care
        as the requirement phrasing everywhere else here.
      */
      tip:
        localValue === undefined
          ? 'No local magnitude was computed'
          : needsPerson
            ? `Over ${MAGNITUDE_RULES.manualReviewAboveLocal}; manual review required`
            : `${MAGNITUDE_RULES.manualReviewAboveLocal} or less; no manual review required`,
    },
    {
      id: 'ml-md',
      label: 'Ml − Md',
      value: difference === undefined ? undefined : difference.toFixed(2),
      verdict: agreementPass,
      tip: requirement(
        agreementPass,
        `under ${MAGNITUDE_RULES.maxTypeDifference} apart`,
        'Needs both a local and a duration magnitude',
      ),
    },
  ]

  /*
    Each magnitude carrying station magnitudes is checked separately, and all
    of them have to pass - "90 pct of the station Ml's AND station Md's".
    Reported as one line because two lines of near-identical text is exactly
    the mouthful this is meant to avoid; the tooltip names which one failed.
  */
  const withStations = origin.magnitudes.filter((m) => m.stationMagnitudes.length > 0)
  if (withStations.length === 0) {
    criteria.push({
      id: 'station-residuals',
      label: 'Station residuals',
      verdict: 'unknown',
      tip: 'No station magnitudes were reported for this origin',
    })
    return criteria
  }

  const perMagnitude = withStations.map((magnitude) => {
    const { counted, good } = counts(magnitude)
    return { magnitude, counted, good, needed: stationsNeeded(counted.length) }
  })

  // An empty population cannot satisfy the rule - 0 of 0 is not evidence.
  const failing = perMagnitude.filter(
    (entry) => entry.counted.length === 0 || entry.good.length < entry.needed,
  )
  // The one furthest from its own target is the one worth showing a count for.
  const worst = perMagnitude.reduce((low, entry) =>
    entry.good.length - entry.needed < low.good.length - low.needed ? entry : low,
  )
  const networks = MAGNITUDE_RULES.networks.join('/')

  criteria.push({
    id: 'station-residuals',
    label: 'Station residuals',
    value:
      worst.counted.length === 0 ? undefined : `${worst.good.length}/${worst.counted.length}`,
    verdict: failing.length === 0 ? 'pass' : 'fail',
    /*
      Stated as a target rather than a percentage: "at least 6 of 6" is
      something a reviewer can check against the table in front of them, where
      "90%" needs arithmetic first.
    */
    tip:
      failing.length === 0
        ? `At least ${worst.needed} of ${worst.counted.length} ${networks} stations need residuals within ±${MAGNITUDE_RULES.maxStationResidual}`
        : failing
            .map((entry) =>
              entry.counted.length === 0
                ? `${capitalise(label(entry.magnitude))}: no ${networks} station has a residual`
                : `${capitalise(label(entry.magnitude))}: needs at least ${entry.needed} of ${entry.counted.length} ${networks} stations within ±${MAGNITUDE_RULES.maxStationResidual}, has ${entry.good.length}`,
            )
            .join('. '),
  })
  return criteria
}

/**
 * How many stations have to be good, as a count rather than a fraction.
 *
 * Rounded UP, so nine of ten passes and eight does not, and never below one:
 * a magnitude resting on a single station still needs that station to be
 * good, and "at least 0" would be a rule that cannot be broken.
 */
export function stationsNeeded(counted: number): number {
  if (counted === 0) return 0
  return Math.max(1, Math.ceil(counted * MAGNITUDE_RULES.minGoodFraction))
}

function label(magnitude: Magnitude): string {
  return magnitude.type ?? magnitude.kind ?? 'magnitude'
}

/**
 * Every criterion passed outright.
 *
 * A warning counts against it: "needs a person" is precisely the case where
 * nothing should happen automatically.
 */
export function allSatisfied(criteria: Criterion[]): boolean {
  return criteria.length > 0 && criteria.every((criterion) => criterion.verdict === 'pass')
}
