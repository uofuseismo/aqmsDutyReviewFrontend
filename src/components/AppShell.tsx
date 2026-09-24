import { Alert, Box, Container, Flex, Heading, Stack } from '@chakra-ui/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link as RouterLink, useMatch } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ColorModeButton } from './ui/color-mode'
import { UserMenu } from './UserMenu'

export function AppShell({ children }: { children: ReactNode }) {
  // Deliberately does NOT read the session clock: only SessionFacts ticks, so
  // the shell - and the whole page under it - is left alone once a second.
  const { permission } = useAuth()

  /*
    Two pinned bars, and one screen.

    An event page has its own sticky summary bar. Both used to pin at top 0
    at the same z-index, so scrolling slid the summary bar over this header
    and left it half covered - on every browser, noticed first in Firefox.

    On a wide screen they stack: this header stays pinned exactly as it is on
    the list, and the summary bar docks under it (see --app-header-height).
    On a phone there is no room for both - the summary bar alone is a
    quarter of the screen - so on an event page this header scrolls away
    and the summary bar takes the top. The list keeps it pinned everywhere.
  */
  const onEvent = useMatch('/events/:eventId') !== null
  const header = useRef<HTMLDivElement>(null)

  /*
    Published as a CSS variable rather than hard-coded: the height is
    whatever the header renders at, and on a phone with a notch the safe-area
    padding adds to it. Measured, it cannot drift.
  */
  useEffect(() => {
    const element = header.current
    if (!element) return
    const root = document.documentElement
    const publish = () =>
      root.style.setProperty('--app-header-height', `${element.getBoundingClientRect().height}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-header-height')
    }
  }, [])

  return (
    <Flex direction="column" minH="100dvh">
      <Box
        as="header"
        ref={header}
        borderBottomWidth="1px"
        bg="bg.panel"
        position={onEvent ? { base: 'static', md: 'sticky' } : 'sticky'}
        top="0"
        zIndex="docked"
        css={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Container maxW="6xl" py="3">
          {/*
            One row again, on every width. The name, access level and session
            countdown live in the account menu now, so the title is no longer
            competing with a badge reading "Administrator" for room on a phone.
          */}
          <Flex align="center" gap="3">
            <Box height="6" width="3px" bg="utahRed.solid" rounded="full" />
            <Heading size="md" flex="1" minW="0" truncate>
              {/* Doubles as the way home from anywhere in the app. */}
              <RouterLink to="/">Duty Review</RouterLink>
            </Heading>
            <ColorModeButton />
            <UserMenu />
          </Flex>
        </Container>
      </Box>

      {/*
        A real <main>: without it every scan reports "content not contained by
        landmarks" for the whole page, and a screen-reader user has no way to
        skip the header.
      */}
      <Container as="main" id="main" maxW="6xl" py="6" flex="1">
        <Stack gap="5">
          {permission === 'none' && (
            <Alert.Root status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>This account has no permissions</Alert.Title>
                <Alert.Description>
                  You are signed in, but the token carries no permission claim,
                  so every action will be refused. Ask an administrator to set a
                  permission level on your account.
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          {children}
        </Stack>
      </Container>

    </Flex>
  )
}
