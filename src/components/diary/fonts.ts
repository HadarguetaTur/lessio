import localFont from 'next/font/local'

/**
 * The diary's three faces, self-hosted under public/fonts, all carrying
 * Hebrew and Latin: Secular One for display, Assistant for text, Amatic SC
 * for the pen. Loaded once here and shared by every diary surface (landing,
 * auth, legal) so they never disagree.
 */
const display = localFont({
  src: '../../../public/fonts/SecularOne-Regular.ttf',
  weight: '400',
  variable: '--font-display',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

const text = localFont({
  src: '../../../public/fonts/Assistant-Variable.ttf',
  weight: '200 800',
  variable: '--font-text',
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

const pen = localFont({
  src: [
    { path: '../../../public/fonts/AmaticSC-Regular.ttf', weight: '400' },
    { path: '../../../public/fonts/AmaticSC-Bold.ttf', weight: '700' },
  ],
  variable: '--font-pen',
  display: 'swap',
  fallback: ['cursive'],
})

/** The class names that put the three font variables on a diary root. */
export const diaryFontVars = `${display.variable} ${text.variable} ${pen.variable}`
