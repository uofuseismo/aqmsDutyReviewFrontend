import { Box, Card, Flex, Stack, Text } from '@chakra-ui/react'
import { ColorModeButton } from './ui/color-mode'
import { BrandHeader } from './BrandHeader'
import { LoginForm } from './LoginForm'

export function LoginScreen() {
  return (
    <Flex
      direction="column"
      minH="100dvh"
      bg="bg.subtle"
      // Keeps the layout clear of notches and the home indicator when the
      // app is opened full-screen on a phone.
      css={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* In a banner landmark rather than loose in the document: content
          outside every landmark is what the "region" rule reports. */}
      <Flex as="header" justify="flex-end" p="3">
        <ColorModeButton />
      </Flex>

      {/* The sign-in card is the whole of this page's content, so it is the
          main landmark - without one, a scan reports every element here as
          outside any landmark. */}
      <Flex
        as="main"
        flex="1"
        align={{ base: 'flex-start', sm: 'center' }}
        justify="center"
        px={{ base: '4', sm: '6' }}
        pb="10"
      >
        <Card.Root
          width="full"
          maxW="26rem"
          overflow="hidden"
          borderWidth="1px"
          shadow={{ base: 'none', sm: 'lg' }}
          bg="bg.panel"
        >
          {/* Utah Red is the primary and is meant to lead; a full-bleed rule
              carries it without swamping the form. */}
          <Box height="4px" bg="utahRed.solid" />
          <Card.Body p={{ base: '5', sm: '7' }}>
            <Stack gap="6">
              <BrandHeader />
              <LoginForm />
            </Stack>
          </Card.Body>
        </Card.Root>
      </Flex>

      {/* The one remaining scrap of content outside a landmark; as a
          footer it becomes contentinfo. */}
      <Text
        as="footer"
        fontSize="xs"
        color="fg.muted"
        textAlign="center"
        pb="4"
        px="4"
      >
        University of Utah Seismograph Stations
      </Text>
    </Flex>
  )
}
