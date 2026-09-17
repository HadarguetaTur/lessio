import localFont from 'next/font/local'

/**
 * Lessio's three faces, self-hosted under public/fonts, all carrying Hebrew
 * and Latin. One module so the product shell and the diary surfaces (landing,
 * auth, legal) can never disagree.
 *
 * - Assistant is the one UI family for the whole product. Geist, which it
 *   replaces, has no Hebrew glyphs, so the Hebrew interface was rendering in
 *   whatever the operating system fell back to.
 * - Secular One is the display voice: diary headlines, and inside the product
 *   only the page title and the wordmark.
 * - Amatic SC is the pen: the diary, and the four "diary moments" inside the
 *   product. Its files are fetched only where the face is actually used.
 */
export const displayFont = localFont({
  src: '../../public/fonts/SecularOne-Regular.ttf',
  weight: '400',
  variable: '--font-display',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

export const textFont = localFont({
  src: '../../public/fonts/Assistant-Variable.ttf',
  weight: '200 800',
  variable: '--font-text',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

export const penFont = localFont({
  src: [
    { path: '../../public/fonts/AmaticSC-Regular.ttf', weight: '400' },
    { path: '../../public/fonts/AmaticSC-Bold.ttf', weight: '700' },
  ],
  variable: '--font-pen',
  display: 'swap',
  preload: false,
  fallback: ['cursive'],
})

/** The class names that put the three font variables on a root element. */
export const fontVars = `${displayFont.variable} ${textFont.variable} ${penFont.variable}`
