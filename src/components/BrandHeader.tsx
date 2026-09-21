import { Heading, Stack, Text } from '@chakra-ui/react'

/**
 * A typographic lockup rather than a drawn Block U.
 *
 * The Block U is a registered mark and the only asset in the repo is a 16x16
 * favicon, so approximating it here would be both off-brand and legally
 * awkward. Drop the official SVG in as `src/assets/block-u.svg` and render it
 * above the heading when one is available.
 */
export function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <Stack gap="0" align="center" textAlign="center">
      <Heading
        as="h1"
        /**
         * 32pt = 2.667rem = 42.67px at a 96dpi default, stepped down on the
         * narrowest phones so the name does not break into three lines. Set
         * in rem rather than pt so it still scales with a reader's own
         * browser font size.
         */
        fontSize={compact ? 'lg' : { base: '2.25rem', sm: '2.667rem' }}
        lineHeight="1.05"
        letterSpacing="-0.025em"
        fontWeight="bold"
        // If it does wrap, wrap it evenly rather than leaving one orphan word.
        textWrap="balance"
      >
        AQMS Duty Review
      </Heading>
      {/* Logging in is what this screen is for, so the word says so at the
          size of a real heading instead of sitting underneath as fine print. */}
      <Text as="h2" fontSize="2xl" fontWeight="semibold" color="fg" mt="3">
        Login
      </Text>
    </Stack>
  )
}
