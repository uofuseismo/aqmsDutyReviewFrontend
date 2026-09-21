import { useTheme } from 'next-themes'

export type ColorMode = 'light' | 'dark'

export function useColorMode() {
  const { resolvedTheme, setTheme } = useTheme()
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light'
  return {
    colorMode,
    setColorMode: setTheme,
    toggleColorMode: () => setTheme(colorMode === 'dark' ? 'light' : 'dark'),
  }
}
