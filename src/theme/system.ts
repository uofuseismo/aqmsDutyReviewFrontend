import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

/**
 * University of Utah brand palette.
 * Source: https://brand.utah.edu/branding/colors/
 *
 * Utah Red is the primary and is meant to dominate; the accent colors are
 * capped at ~10% of a composition by the brand guidelines, so they live here
 * for data visualization and status use rather than for chrome.
 */
const UTAH_RED = '#BE0000'
const RED_ROCKS = '#890000'

/**
 * Utah Red, lifted just enough to be legal on a dark panel.
 *
 * #BE0000 carries white text fine (6.58:1) but its own fill only reaches
 * 2.87:1 against the dark panel behind it, under the 3:1 that WCAG 1.4.11
 * asks of a control's boundary - a solid button whose edge is hard to find.
 * This is the nearest red to the brand hex that clears both: 5.89:1 with
 * white on it, 3.21:1 against the panel. Light mode keeps the true brand
 * value, which passes on white unaided.
 */
const UTAH_RED_ON_DARK = '#CC0000'

/**
 * A 50-950 ramp built around Utah Red so that Chakra's `colorPalette` recipes
 * (Button, Field, Alert, ...) have the full set of steps they expect. The
 * brand hex sits at step 600 and Red Rocks, the brand's own darker red, at
 * 800, so the two official values are reproduced exactly rather than
 * approximated by an interpolation.
 */
const utahRedRamp = {
  50: { value: '#FFF5F4' },
  100: { value: '#FFE3E0' },
  200: { value: '#FFC4BF' },
  300: { value: '#FF9B93' },
  400: { value: '#F26A60' },
  500: { value: '#DB3B30' },
  600: { value: UTAH_RED },
  700: { value: '#A10000' },
  800: { value: RED_ROCKS },
  900: { value: '#6B0505' },
  950: { value: '#3B0303' },
}

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        utahRed: utahRedRamp,
        utah: {
          // The flat brand values, for charts, map symbology and status accents.
          cinder: { value: '#707271' }, // Zion Cinder Cone
          granite: { value: '#708E99' }, // Granite Peak
          sunrise: { value: '#FFB81D' }, // Wasatch Sunrise
          mountainGreen: { value: '#6CC24A' },
          greatSaltLake: { value: '#3ABFC0' },
          saltFlat: { value: '#E2E6E6' },
          redOnDark: { value: UTAH_RED_ON_DARK },
        },
      },
      fonts: {
        /**
         * Inter, self-hosted via @fontsource-variable (imported in main.tsx).
         *
         * One face everywhere, rather than a system stack that renders as a
         * different typeface on every device a duty seismologist might pick
         * up. It is a sans designed for interfaces: it holds up at the small
         * sizes a dense event table needs, and its digits are unambiguous -
         * 1/7, 0/O and 5/S stay distinct, which matters when the text is an
         * origin time or a magnitude.
         *
         * Self-hosted rather than pulled from Google's CDN: the app is served
         * from a local data center behind two nginx hops, so an external font
         * request is a dependency that can fail, leak referrers, or be
         * blocked outright. The fallbacks cover the swap window.
         */
        heading: {
          value:
            '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        body: {
          value:
            '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
      },
    },
    semanticTokens: {
      colors: {
        /**
         * The attention red as TEXT - a flagged residual, a flagged count.
         *
         * The marker red `#E03131` (see pickPalette) measures 4.51:1 on white
         * and 4.41:1 on the dark panel: passing by a hair in one theme and
         * failing in the other, which an axe scan caught on a residual at
         * 10.5px. No single red clears 4.5:1 on both grounds - darkening it
         * for white makes it worse on black. So it gets the same dark-mode
         * lift Utah Red already has:
         *
         *   light  #C92A2A  5.46:1 on white
         *   dark   #F16A6A  6.64:1 on the dark panel
         *
         * Markers keep `#E03131`: they are not text, the 4.5:1 rule does not
         * apply to them, and they sit on map tiles rather than on the panel.
         */
        attentionText: {
          value: { _light: '#C92A2A', _dark: '#F16A6A' },
        },
        /**
         * The warning step, chosen the same way and for the same reason: a
         * mid orange fails on one ground or the other, so each theme gets the
         * one that clears 4.5:1 against its own background.
         *
         *   light  #B45309  5.02:1 on white
         *   dark   #F59E0B  9.26:1 on the dark panel
         */
        warningText: {
          value: { _light: '#B45309', _dark: '#F59E0B' },
        },
        /**
         * Green's SOLID step, darkened.
         *
         * Chakra's default is #16A34A, which carries white text at 3.30:1 -
         * under the 4.5:1 an axe scan wants, and it is the Accept button that
         * ends a review. #15803D (green.700) is 5.02:1 and still reads as the
         * same green. Only the solid variant moves; the subtle green on a
         * "Finalized" badge draws its text from a different token and was
         * never the problem.
         */
        green: {
          solid: { value: { _light: '{colors.green.700}', _dark: '{colors.green.700}' } },
        },
        // Mirrors the shape Chakra's own palettes use, which is what makes
        // `colorPalette="utahRed"` work on the stock recipes.
        utahRed: {
          contrast: { value: { _light: 'white', _dark: 'white' } },
          fg: {
            value: { _light: '{colors.utahRed.700}', _dark: '{colors.utahRed.300}' },
          },
          subtle: {
            value: { _light: '{colors.utahRed.50}', _dark: '{colors.utahRed.950}' },
          },
          muted: {
            value: { _light: '{colors.utahRed.100}', _dark: '{colors.utahRed.900}' },
          },
          emphasized: {
            value: { _light: '{colors.utahRed.200}', _dark: '{colors.utahRed.800}' },
          },
          /**
           * The true brand hex on light; lifted on dark so the control's own
           * edge clears 3:1 against the panel. See UTAH_RED_ON_DARK.
           */
          solid: {
            value: {
              _light: '{colors.utahRed.600}',
              _dark: '{colors.utah.redOnDark}',
            },
          },
          focusRing: {
            value: { _light: '{colors.utahRed.500}', _dark: '{colors.utahRed.500}' },
          },
          border: {
            value: { _light: '{colors.utahRed.500}', _dark: '{colors.utahRed.400}' },
          },
        },
      },
    },
  },
  globalCss: {
    'html, body': {
      bg: 'bg.subtle',
      color: 'fg',
      // dvh, not vh: mobile browser chrome collapsing mid-scroll otherwise
      // leaves a strip of blank viewport under the layout.
      minH: '100dvh',
    },
    // Keeps iOS from zooming the viewport when a text field takes focus,
    // which it does for any input under 16px.
    'input, textarea, select': {
      fontSize: { base: '16px', md: 'inherit' },
    },
  },
})

export const system = createSystem(defaultConfig, config)
