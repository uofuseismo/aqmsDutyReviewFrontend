/**
 * One colour rule for picks, everywhere they appear.
 *
 * COLOUR MEANS STATUS. Shape means phase. That split is deliberate and is
 * meant to hold across the map, the arrivals table and - when they arrive -
 * the waveforms:
 *
 *   - a reviewer learns ONE thing about colour ("red wants looking at") and
 *     it stays true on every screen;
 *   - phase already has a channel that colour cannot compete with - the shape
 *     on a map, the letter on a table row, the label on a trace.
 *
 * The alternative, colouring by phase, would force status onto a second
 * channel and leave colour meaning different things in different views, which
 * is the failure worth avoiding.
 *
 * Deliberately not Utah Red (#BE0000): that is the colour of things you press.
 * A residual is not an action.
 */
export const PICK_OK = '#2D7FF9'

/**
 * The attention red, for MARKERS - shapes on a map or a trace.
 *
 * Non-text, so the 4.5:1 rule does not apply to it, and it sits on map tiles
 * rather than on the page background in any case.
 */
export const PICK_ATTENTION = '#E03131'

/**
 * The same red as TEXT lives in the theme, as the `attentionText` semantic
 * token - see src/theme/system.ts for why it is theme-aware and this is not.
 */
export const ATTENTION_TEXT_TOKEN = 'attentionText'

/**
 * The middle step: over the first threshold, under the second.
 *
 * One orange for both themes, as with the blue and the red - these are marker
 * fills sitting on map tiles, not text on the page, so they are not bound by
 * the 4.5:1 rule that makes the TEXT colours theme-aware.
 */
export const PICK_WARNING = '#E8830E'

/**
 * Three steps, not two. Analysts asked for "worth a look" to be told apart
 * from "something is wrong" - see ResidualLevel in eventDetail.
 */
export type PickStatus = 'ok' | 'warning' | 'alert'

export function pickColor(status: PickStatus): string {
  if (status === 'alert') return PICK_ATTENTION
  if (status === 'warning') return PICK_WARNING
  return PICK_OK
}

/** The worse of two levels, for one marker standing in for several picks. */
export function worseStatus(a: PickStatus, b: PickStatus): PickStatus {
  const rank = { ok: 0, warning: 1, alert: 2 } as const
  return rank[a] >= rank[b] ? a : b
}

/* ------------------------------------------------------------------ */
/* Waveform picks                                                       */
/* ------------------------------------------------------------------ */

/**
 * Picks drawn on a trace.
 *
 * VALUE separates the phases, HUE still carries status. Black for P and a
 * dark grey for S is a difference in darkness, not colour, so it does not
 * spend the channel that means "this needs attention" - the rule above
 * survives intact. Labels do the unambiguous work; the value difference is
 * what keeps them apart when the trace is zoomed out and the record after S
 * is a wall of squiggle.
 *
 * SOLID ONLY. A dashed pick means a theoretical or predicted arrival
 * elsewhere in this field, and these are neither - they are somebody's
 * actual pick. Dashing is reserved so it can mean that later.
 *
 * Theme-aware for the same reason the map outlines are: a black pick over a
 * dark trace on a dark background is invisible, which is precisely the
 * situation an analyst is in at three in the morning.
 */
export interface WaveformPickInk {
  /** Any pick on a trace that carries only one phase, and P when mixed. */
  p: string
  /** S, and ONLY on a trace that also carries P. See waveformPickColor. */
  s: string
  /** Any pick over the ALERT threshold, whichever phase. */
  attention: string
}

const WAVEFORM_INK_LIGHT: WaveformPickInk = {
  p: '#111111',
  s: '#6B6B6B',
  attention: PICK_ATTENTION,
}

const WAVEFORM_INK_DARK: WaveformPickInk = {
  p: '#F5F5F5',
  s: '#9A9A9A',
  attention: PICK_ATTENTION,
}

export function waveformPickInk(colorMode: 'light' | 'dark'): WaveformPickInk {
  return colorMode === 'dark' ? WAVEFORM_INK_DARK : WAVEFORM_INK_LIGHT
}

/**
 * The colour for one pick on a trace.
 *
 * Status wins when it applies: a flagged pick is the one thing on the trace
 * worth interrupting for, and its label still says which phase it is.
 *
 * Otherwise the DARKEST ink, unless the trace forces a compromise. P is
 * picked on the vertical and S on a horizontal, so in practice each lands on
 * its own trace and the channel already says which phase it is - spending the
 * grey there only buys an S pick that is harder to see against a grey
 * waveform, which is the whole objection to it.
 *
 * `mixedPhases` is the exception the grey exists for: one trace carrying both
 * phases, which happens when the batch did not include the channel a pick was
 * made on. Then the inks have to do the separating, and value is still the
 * right axis to do it on - hue stays reserved for status.
 */
export function waveformPickColor(
  phase: string,
  status: PickStatus,
  colorMode: 'light' | 'dark',
  mixedPhases: boolean,
): string {
  const ink = waveformPickInk(colorMode)
  if (status === 'alert') return ink.attention
  if (status === 'warning') return PICK_WARNING
  if (!mixedPhases) return ink.p
  return phase.trim().toUpperCase().startsWith('S') ? ink.s : ink.p
}

/**
 * The trace itself.
 *
 * Deliberately LIGHTER than both pick inks in light mode and DARKER than both
 * in dark mode, so the ordering the inks above assume actually holds: P is
 * "the darkest ink available against the trace" only if the trace is not
 * itself that dark. The cost is a trace with less contrast than pure black
 * would give; the benefit is that a pick is never lost in the squiggle.
 *
 * Note for when S picks first appear in real data: S and the trace are the
 * closest pair in this scheme, and if they read as one thing on a real record
 * the S ink should move, not the trace.
 */
export function waveformTraceInk(colorMode: 'light' | 'dark'): string {
  return colorMode === 'dark' ? '#6F6F6F' : '#8C8C8C'
}

/** Picks are drawn solid. See the note above on dashing. */
export const PICK_LINE_DASH: undefined = undefined
