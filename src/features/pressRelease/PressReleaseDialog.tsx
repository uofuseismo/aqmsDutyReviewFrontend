import {
  Alert,
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Portal,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LuCheck, LuCopy, LuDownload, LuRefreshCw } from 'react-icons/lu'
import { buildPressRelease, type History } from './pressRelease'
import { searchHistory } from './comcat'

/** What the release is about - the event's PREFERRED solution, whatever is being browsed. */
export interface ReleaseSubject {
  eventId: number
  originTime: Date
  latitude: number
  longitude: number
  magnitude: number
  /** The ComCat this system publishes to - see dyfiUrl. */
  comcatPrefix?: string
}

type Search =
  | { state: 'searching' }
  | { state: 'found'; history: History }
  | { state: 'failed'; message: string }
  /** The reviewer chose not to wait - the release goes without its history sentence. */
  | { state: 'skipped' }

/**
 * Drafts the press release: asks ComCat about the area's past, then writes
 * the text for the reviewer to copy into the group chat.
 *
 * Nothing is sent anywhere. That is why read-only reviewers may use it, and
 * why it is a draft: the wording gets iterated on in the chat, not here.
 *
 * ComCat can be slow, and the history sentence is the one part of the
 * release worth waiting a little for but not worth being stuck on - so the
 * wait always has a way out, and a failure is said rather than silently
 * dropping the sentence the way firstInfo.py did.
 */
export function PressReleaseDialog({
  open,
  onClose,
  subject,
}: {
  open: boolean
  onClose: () => void
  subject: ReleaseSubject
}) {
  const [search, setSearch] = useState<Search>({ state: 'searching' })
  /** When the text was written - the "Released:" line, fixed once shown. */
  const [releasedAt, setReleasedAt] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)
  /** Neither clipboard route worked; the text has been selected instead. */
  const [copyFailed, setCopyFailed] = useState(false)
  const textBox = useRef<HTMLPreElement>(null)
  const inFlight = useRef<AbortController | null>(null)

  const run = useCallback(() => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setSearch({ state: 'searching' })
    setReleasedAt(null)
    setCopied(false)
    setCopyFailed(false)
    searchHistory(subject.latitude, subject.longitude, subject.originTime, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return
        setSearch({ state: 'found', history })
        setReleasedAt(new Date())
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setSearch({
          state: 'failed',
          message: cause instanceof Error ? cause.message : 'Could not search ComCat.',
        })
      })
  }, [subject.latitude, subject.longitude, subject.originTime])

  // A fresh search each time it opens; nothing left running once it closes.
  useEffect(() => {
    if (!open) return
    const start = window.setTimeout(run, 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [open, run])

  const skip = () => {
    inFlight.current?.abort()
    setSearch({ state: 'skipped' })
    setReleasedAt(new Date())
  }

  const text =
    releasedAt !== null && (search.state === 'found' || search.state === 'skipped')
      ? buildPressRelease({
          ...subject,
          history: search.state === 'found' ? search.history : null,
          releasedAt,
        })
      : null

  /*
    Copy, with two fallbacks, because a copy that silently does nothing is
    worse than no button: the reviewer pastes yesterday's clipboard into the
    group chat.

    The async clipboard API exists only on HTTPS (and localhost). On a plain
    HTTP deployment it is undefined, so the old execCommand route is tried;
    if that fails too, the text is selected and the reviewer is told to press
    Ctrl+C - which works everywhere.
  */
  const copy = async () => {
    if (text === null) return
    setCopied(false)
    setCopyFailed(false)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        return
      }
    } catch {
      // Refused - fall through to the older route.
    }
    const scratch = document.createElement('textarea')
    scratch.value = text
    scratch.setAttribute('readonly', '')
    scratch.style.position = 'fixed'
    scratch.style.opacity = '0'
    document.body.appendChild(scratch)
    scratch.select()
    const ok = (() => {
      try {
        return document.execCommand('copy')
      } catch {
        return false
      }
    })()
    scratch.remove()
    if (ok) {
      setCopied(true)
      return
    }
    // Last resort: select it for the reviewer.
    const box = textBox.current
    if (box) {
      const range = document.createRange()
      range.selectNodeContents(box)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      box.focus()
    }
    setCopyFailed(true)
  }

  const download = () => {
    if (text === null) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    // As firstInfo.py names its output, so the files sort alongside.
    link.download = `${subject.eventId}_press_release.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => !details.open && onClose()}
      placement="center"
      size={{ base: 'full', md: 'lg' }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner p={{ base: '0', md: '4' }}>
          <Dialog.Content>
            <Dialog.Header>
              <Stack gap="0">
                <Dialog.Title>Press release draft</Dialog.Title>
                <Dialog.Description fontSize="sm" color="fg.muted">
                  Event {subject.eventId}, from its preferred origin and magnitude. Copy it into the
                  group chat for review.
                </Dialog.Description>
              </Stack>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>

            <Dialog.Body>
              <Stack gap="3">
                {search.state === 'searching' && (
                  <HStack gap="3" color="fg.muted" role="status">
                    <Spinner size="sm" />
                    <Text fontSize="sm" flex="1">
                      Searching ComCat for earlier events nearby… this can take up to half a
                      minute.
                    </Text>
                    <Button size="xs" variant="outline" onClick={skip}>
                      Continue without history
                    </Button>
                  </HStack>
                )}

                {search.state === 'failed' && (
                  <Alert.Root status="warning" role="alert">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>No history from ComCat</Alert.Title>
                      <Alert.Description>
                        <Stack gap="2">
                          <Text>
                            {search.message} The release can still go out without the sentence
                            about earlier events.
                          </Text>
                          <HStack gap="2" wrap="wrap">
                            <Button size="xs" variant="outline" onClick={run}>
                              <LuRefreshCw /> Retry
                            </Button>
                            <Button size="xs" variant="outline" onClick={skip}>
                              Continue without history
                            </Button>
                          </HStack>
                        </Stack>
                      </Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}

                {search.state === 'skipped' && (
                  <Text fontSize="sm" color="warningText">
                    Without ComCat history - the sentence about earlier events is left out.
                  </Text>
                )}

                {copyFailed && (
                  <Text fontSize="sm" color="warningText" role="status">
                    This browser would not copy it automatically. The text is selected - press
                    Ctrl+C (⌘C on a Mac).
                  </Text>
                )}
                {text !== null && (
                  <Box
                    ref={textBox}
                    as="pre"
                    tabIndex={0}
                    aria-label="Press release text"
                    whiteSpace="pre-wrap"
                    fontFamily="body"
                    fontSize="sm"
                    lineHeight="tall"
                    borderWidth="1px"
                    rounded="md"
                    p="3"
                    bg="bg.subtle"
                    maxH={{ base: 'none', md: '50vh' }}
                    overflowY="auto"
                  >
                    {text}
                  </Box>
                )}
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <HStack gap="2" wrap="wrap" justify="flex-end" w="full">
                <Button variant="outline" size="sm" disabled={text === null} onClick={download}>
                  <LuDownload /> Download .txt
                </Button>
                <Button size="sm" colorPalette="utahRed" disabled={text === null} onClick={() => void copy()}>
                  {copied ? <LuCheck /> : <LuCopy />} {copied ? 'Copied' : 'Copy text'}
                </Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
