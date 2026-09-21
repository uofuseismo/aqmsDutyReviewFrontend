import { ChakraProvider } from '@chakra-ui/react'
import type { ThemeProviderProps } from 'next-themes'
import { system } from '../../theme/system'
import { ColorModeProvider } from './color-mode'

export function Provider(props: ThemeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  )
}
