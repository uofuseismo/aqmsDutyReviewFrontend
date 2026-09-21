import { Alert, Box, Container, Flex, Heading, Stack } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ColorModeButton } from './ui/color-mode'
import { UserMenu } from './UserMenu'

export function AppShell({ children }: { children: ReactNode }) {
  // Deliberately does NOT read the session clock: only SessionFacts ticks, so
  // the shell - and the whole page under it - is left alone once a second.
  const { permission } = useAuth()

  return (
    <Flex direction="column" minH="100dvh">
      <Box
        as="header"
        borderBottomWidth="1px"
        bg="bg.panel"
        position="sticky"
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
