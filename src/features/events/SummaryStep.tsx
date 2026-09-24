import {
  Alert,
  Badge,
  Box,
  Button,
  Dialog,
  HStack,
  Icon,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useRef, useState } from 'react'
import { LuArrowLeft, LuCheck, LuCircleCheck, LuX } from 'react-icons/lu'
import { Link as RouterLink } from 'react-router'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { Tooltip } from '../../components/ui/Tooltip'
import { humanize, reviewStatusPalette } from './format'
import { AlarmsPanel } from '../alarms/AlarmsPanel'
import { POST_ACTION_REFRESH_MS, useAlarms } from '../alarms/useAlarms'
import { hasNotified } from '../alarms/alarms'
import { CriteriaTable } from './CriteriaTable'
import { allSatisfied, locationCriteria, magnitudeCriteria } from './autoAccept'
import {
  confirmationFor,
  expectedSolutionOf,
  isSolutionChanged,
  submitEventAction,
  type Confirmation,
  type EventAction,
} from './eventActions'
import type { EventDetail, Origin } from './eventDetail'
import type { CatalogEvent } from './types'

/**
 * Everything above the buttons that cannot shrink.
 *
 * Measured the same way as the Location step's: by reading how far the Accept
 * button sat below the fold and giving the difference back. The evidence
 * scrolls inside its own box so the decision itself never leaves the screen -
 * a button you have to scroll to find is the complaint that started all this.
 */
/**
 * The end of the review: accept the event or cancel it.
 *
 * Both buttons are always DRAWN, even for a reader who may not press them.
 * Hiding them would leave a read-only reviewer looking at a step that appears
 * unfinished, with no way to tell whether the feature is missing or simply
 * not theirs; a disabled button with a reason attached answers that.
 */
export function SummaryStep({
  event,
  detail,
  origin: chosenOrigin,
  onDone,
  onRefresh,
  changeUnreviewed = false,
}: {
  event: CatalogEvent
  detail: EventDetail | null
  /** The origin under review, chosen in the summary bar. */
  origin?: Origin
  /** Called after a successful action, to refresh the catalog behind us. */
  onDone?: () => void
  /** Called after a successful action, to re-read this event's own state. */
  onRefresh?: () => void
  /** The event changed under this review and nobody has acknowledged it. */
  changeUnreviewed?: boolean
}) {
  const { can, getToken, expireSession } = useAuth()
  const [pending, setPending] = useState<EventAction | null>(null)
  const [done, setDone] = useState<{ action: EventAction; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ action: EventAction; ask: Confirmation } | null>(
    null,
  )
  const inFlight = useRef<AbortController | null>(null)

  /*
    An outcome belongs to the solution it was reached on.

    "Event cancelled" stayed on screen after the analyst re-saved the event
    in the processing tool - a new solution, reopened, with the only way
    forward hidden behind a result that no longer described it. So when the
    solution changes, the old outcome goes and the buttons come back (locked
    behind the change notice until it is acknowledged).

    Adjusted during render, as the page does for the notice itself, so the
    stale outcome never shows beside the new solution for a frame.
  */
  const solutionKey = `${detail?.preferredOriginId}:${detail?.preferredMagnitudeId}:${detail?.eventType}`
  const [outcomeFor, setOutcomeFor] = useState(solutionKey)
  if (outcomeFor !== solutionKey) {
    setOutcomeFor(solutionKey)
    setDone(null)
    setConfirming(null)
  }
  /*
    A refusal is answered once the change is acknowledged.

    After a 409 the backend's "changed while you were reviewing it" stays up
    beside the notice - it says nothing was done, which is worth reading. Once
    the reviewer presses Reviewed it is history, and left there it would sit
    over the buttons looking like the next attempt's answer.
  */
  const [wasLocked, setWasLocked] = useState(changeUnreviewed)
  if (wasLocked !== changeUnreviewed) {
    setWasLocked(changeUnreviewed)
    if (!changeUnreviewed) setError(null)
  }

  const mayAct = can('read_write')
  /*
    The EVENT's state, not the selected origin's.

    Accept and cancel act on the event, so the confirmations - "already
    finalized?", "already cancelled?" - have to ask about the event. A
    reviewer inspecting a non-preferred origin must not be asked a question
    about that origin's status instead.
  */
  const reviewStatus = detail?.preferredOrigin?.reviewStatus ?? event.reviewStatus
  const {
    alarms,
    loading: alarmsLoading,
    error: alarmsError,
    gaveUp: alarmsStuck,
    refreshAfter: refreshAlarms,
  } = useAlarms(event.id)

  const origin = chosenOrigin ?? detail?.preferredOrigin
  const isPreferred = origin !== undefined && origin.id === detail?.preferredOrigin?.id
  const groups =
    origin === undefined
      ? []
      : [
          { title: 'Location', criteria: locationCriteria(origin) },
          { title: 'Magnitude', criteria: magnitudeCriteria(origin) },
        ]
  const wouldAutoAccept = groups.length > 0 && groups.every((g) => allSatisfied(g.criteria))
  const alreadyOut = hasNotified(alarms)

  const run = async (action: EventAction) => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setPending(action)
    setError(null)
    try {
      if (expected === undefined) return
      const message = await submitEventAction(
        action,
        event.id,
        expected,
        getToken(),
        controller.signal,
      )
      if (controller.signal.aborted) return
      /*
        Stay here and say what happened.

        This used to jump straight back to the event list, which reviewers
        found disorienting - the screen they were reading vanished at the
        moment they acted, with no confirmation they could take in. Leaving is
        now a choice they make afterwards.

        Both refreshes still run: the catalog behind us is stale the instant
        this succeeds, and so is this event's own status.
      */
      setDone({ action, message })
      onDone?.()
      onRefresh?.()
      /*
        The decision fires alarms of its own, and they do not appear instantly
        - so one read a few seconds later, rather than immediately, where it
        would show the same list and look as though nothing happened. If
        anything comes back still PROCESSING the hook keeps asking, up to a
        point.
      */
      refreshAlarms(POST_ACTION_REFRESH_MS)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (cause instanceof ApiError && cause.isUnauthorized) {
        expireSession()
        return
      }
      setError(
        cause instanceof ApiError ? cause.message : `Could not ${action} this event.`,
      )
      /*
        The event moved on - repicked in the processing tool, most likely.
        Nothing was done; the backend's message says so. Load what is there
        now, so the checks on this screen describe the solution the next
        click would act on instead of the one that was just refused.
      */
      if (isSolutionChanged(cause)) {
        onDone?.()
        onRefresh?.()
      }
    } finally {
      if (!controller.signal.aborted) setPending(null)
    }
  }

  const start = (action: EventAction) => {
    const ask = confirmationFor(action, reviewStatus, event.id)
    if (ask !== null) {
      setConfirming({ action, ask })
      return
    }
    /*
      Cancelling an event whose alarms have already fired is not the same act
      as cancelling a quiet one: mail, SMS and pagers have gone, and this does
      not unsend them. Worth a sentence before, not a discovery after.
    */
    if (action === 'cancel' && alreadyOut) {
      setConfirming({
        action,
        ask: {
          title: 'Cancel an event that has already been sent out?',
          body: `Alarms for event ${event.id} have already gone out - mail, messages and pagers among them. Cancelling records the event as cancelled; it does not unsend anything that has been delivered.`,
          proceed: 'Cancel anyway',
        },
      })
      return
    }
    void run(action)
  }

  // What the analyst is looking at, sent with the action so the backend can
  // refuse if the event has changed since. See expectedSolutionOf.
  const expected = expectedSolutionOf(detail)
  const reason = !mayAct
    ? 'Your account has read-only access'
    : expected === undefined
      ? 'Waiting for the event details to load'
      : changeUnreviewed
        ? 'The event changed - review the new solution, then press Reviewed in the notice at the top'
        : undefined

  return (
    <Stack gap="5">
      <Stack gap="1">
        <HStack gap="2" wrap="wrap">
          <Text fontWeight="semibold">Finish the review</Text>
          <Badge variant="subtle" colorPalette={reviewStatusPalette(reviewStatus)}>
            {humanize(reviewStatus)}
          </Badge>
        </HStack>
        <Text fontSize="sm" color="fg.muted">
          Accept promotes this solution. Cancel rejects the event.
        </Text>
      </Stack>

      {/*
        The evidence, in the order it bears on the decision.

        The checks say whether this would have gone through on its own; the
        alarms say whether it has already reached people. Both are read BEFORE
        pressing anything, so neither is behind a tab - the one screen where
        hiding half the information to save space would be the wrong trade.
      */}
      <Stack gap="2">
        <HStack gap="2" wrap="wrap">
          <Text fontSize="sm" fontWeight="medium">
            Auto-accept checks
          </Text>
          <Text fontSize="xs" color={wouldAutoAccept ? 'fg.muted' : 'attentionText'}>
            {groups.length === 0
              ? ''
              : wouldAutoAccept
                ? 'all met'
                : 'not all met - this needs a person'}
          </Text>
        </HStack>
        {/*
          The one place the workflow's "everything follows the chosen origin"
          rule needs a caveat. The checks describe the origin being looked at,
          but Accept and Cancel act on the EVENT - so when those differ, say
          so rather than letting the reviewer infer that accepting promotes
          whatever they happen to have selected.
        */}
        {!isPreferred && origin !== undefined && (
          <Text fontSize="xs" color="warningText">
            These checks are for origin {origin.id}. Accept and cancel act on the event,
            whose preferred origin is {detail?.preferredOrigin?.id ?? 'unknown'}.
          </Text>
        )}
        <CriteriaTable groups={groups} />
      </Stack>

      {/*
        Pinned to the foot of the step.

        The buttons sitting after the checks put them above the fold on a tall
        window, but the alarms below can run to any length and on a short one
        they went under again. Sticky keeps the decision in reach at every
        scroll position without costing a row of layout - and it is the
        decision, so it earns the space it holds.
      */}
      <Box
        position="sticky"
        bottom="0"
        zIndex="1"
        bg="bg.panel"
        pt="3"
        pb="1"
        mb="-1"
        borderTopWidth={done === null ? '1px' : '0'}
      >
      {done !== null ? (
        /*
          The buttons are gone rather than disabled: the decision is made, and
          a greyed-out Accept invites a reviewer to wonder whether it took.
        */
        <Stack gap="3" align="flex-start">
          <HStack gap="2">
            <Icon color="fg.muted" boxSize="5" aria-hidden>
              <LuCircleCheck />
            </Icon>
            <Text fontWeight="semibold">
              {done.action === 'accept' ? 'Event accepted' : 'Event cancelled'}
            </Text>
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            {done.message}
          </Text>
          <Button asChild size="sm" variant="outline">
            <RouterLink to="/">
              <LuArrowLeft /> Back to all events
            </RouterLink>
          </Button>
        </Stack>
      ) : (
      <HStack gap="3" wrap="wrap">
        <ActionButton
          label="Accept"
          icon={<LuCheck />}
          colorPalette="green"
          disabled={reason !== undefined}
          description="Set event as reviewed and issue accept alarms."
          reason={reason}
          loading={pending === 'accept'}
          busy={pending !== null}
          onClick={() => start('accept')}
        />
        <ActionButton
          label="Cancel event"
          icon={<LuX />}
          colorPalette="utahRed"
          variant="outline"
          disabled={reason !== undefined}
          description="Indicate event is erroneous and issue cancel alarms."
          reason={reason}
          loading={pending === 'cancel'}
          busy={pending !== null}
          onClick={() => start('cancel')}
        />
      </HStack>
      )}
      </Box>

      <Stack gap="2">
        <Text fontSize="sm" fontWeight="medium">
          Alarms
        </Text>
        <AlarmsPanel
          alarms={alarms}
          loading={alarmsLoading}
          error={alarmsError}
          stuck={alarmsStuck}
        />
      </Stack>

      {error !== null && (
        <Alert.Root status="error" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}


      {/*
        Friction, and only where it is earned: an action that repeats what the
        event has already been through is either a slip or a decision, and the
        question separates the two. Accepting an unreviewed event or
        cancelling a live one asks nothing - that is the job. What to ask, and
        whether to ask at all, lives in confirmationFor.
      */}
      <Dialog.Root
        open={confirming !== null}
        onOpenChange={(details) => !details.open && setConfirming(null)}
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>{confirming?.ask.title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text fontSize="sm">{confirming?.ask.body}</Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="outline" size="sm">
                    Leave it alone
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="utahRed"
                  size="sm"
                  onClick={() => {
                    const pending = confirming
                    setConfirming(null)
                    if (pending) void run(pending.action)
                  }}
                >
                  {confirming?.ask.proceed}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Stack>
  )
}

/**
 * A button that may be refused, and says why.
 *
 * `aria-disabled` rather than `disabled`, so the control keeps its place in
 * the tab order and a screen reader announces both the button and the reason
 * it cannot be used - a `disabled` button is skipped entirely and explains
 * nothing. The click is refused in the handler instead.
 *
 * The tooltip is the description, or the refusal when there is one. Both
 * matter: "Accept" does not say on its own that it issues alarms.
 */
function ActionButton({
  label,
  icon,
  colorPalette,
  variant,
  disabled,
  description,
  reason,
  loading,
  busy,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  colorPalette: string
  variant?: 'outline'
  disabled: boolean
  /** What pressing it does, always shown. */
  description: string
  /** Why it is refused, shown INSTEAD when it is. */
  reason?: string
  loading: boolean
  busy: boolean
  onClick: () => void
}) {
  const button = (
    <Button
      colorPalette={colorPalette}
      variant={variant}
      size="sm"
      loading={loading}
      loadingText={label}
      aria-disabled={disabled || busy}
      aria-description={reason ?? description}
      onClick={() => {
        if (disabled || busy) return
        onClick()
      }}
    >
      {icon}
      {label}
    </Button>
  )
  /*
    The refusal wins when there is one: a reader who cannot press this needs
    to know why far more than what it would have done.
  */
  return <Tooltip content={reason ?? description}>{button}</Tooltip>
}
