import { ClientOnly, IconButton, Skeleton, type IconButtonProps } from '@chakra-ui/react'
import { ThemeProvider, type ThemeProviderProps } from 'next-themes'
import { forwardRef } from 'react'
import { LuMoon, LuSun } from 'react-icons/lu'
import { Tooltip } from './Tooltip'
import { useColorMode } from './useColorMode'

export function ColorModeProvider(props: ThemeProviderProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  )
}

export const ColorModeButton = forwardRef<
  HTMLButtonElement,
  Omit<IconButtonProps, 'aria-label'>
>(function ColorModeButton(props, ref) {
  const { colorMode, toggleColorMode } = useColorMode()
  const label = `Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`
  return (
    // Nothing knows the resolved theme until after hydration, so rendering
    // the icon before then would flash the wrong one.
    <ClientOnly fallback={<Skeleton boxSize="9" rounded="md" />}>
      <Tooltip content={label}>
        <IconButton
          onClick={toggleColorMode}
          variant="ghost"
          aria-label={label}
          size="sm"
          ref={ref}
          {...props}
        >
          {colorMode === 'dark' ? <LuSun /> : <LuMoon />}
        </IconButton>
      </Tooltip>
    </ClientOnly>
  )
})
