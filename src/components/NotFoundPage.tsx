import { Box, HStack, Stack, Text } from '@chakra-ui/react'
import { LuArrowLeft } from 'react-icons/lu'
import { Link as RouterLink } from 'react-router'

export function NotFoundPage() {
  return (
    <Stack gap="3" py="10" align="center" textAlign="center">
      <Text fontSize="lg" fontWeight="semibold">
        No such page
      </Text>
      <Text color="fg.muted" fontSize="sm">
        That address does not match anything in this app.
      </Text>
      <Box asChild pt="2">
        <RouterLink to="/">
          <HStack gap="1.5" color="utahRed.fg" fontSize="sm">
            <LuArrowLeft aria-hidden />
            <Text>Back to the event list</Text>
          </HStack>
        </RouterLink>
      </Box>
    </Stack>
  )
}
