import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

// Shared by every locale (OG routes can't read the locale cookie), so the card
// is bilingual: Hebrew headline, English subline.
export const alt =
  'LESSIO. מערכת ההפעלה למרכזי למידה. The operating system for tutoring centres'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const fontsDir = join(process.cwd(), 'public', 'fonts')
  const [heeboBold, heeboRegular] = await Promise.all([
    readFile(join(fontsDir, 'Heebo-Bold.ttf')),
    readFile(join(fontsDir, 'Heebo-Regular.ttf')),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          padding: '80px',
          fontFamily: 'Heebo',
          color: 'white',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -60,
            width: 320,
            height: 320,
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: -80,
            width: 380,
            height: 380,
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)',
            display: 'flex',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginBottom: 64,
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 32,
              background: '#111c32',
              border: '2px solid #475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <div style={{ width: 58, height: 68, display: 'flex', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 2, left: 2, width: 18, height: 60, borderRadius: 14, background: '#2dd4bf' }} />
              <div style={{ position: 'absolute', bottom: 2, left: 2, width: 54, height: 18, borderRadius: 14, background: 'linear-gradient(90deg, #2dd4bf 0%, #8b5cf6 100%)' }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 18, height: 18, borderRadius: 99, background: '#a78bfa' }} />
            </div>
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            LESSIO
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 60,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: 28,
            maxWidth: 1000,
            justifyContent: 'center',
          }}
        >
          מרכז למידה, בשליטה.
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 34,
            fontWeight: 400,
            opacity: 0.95,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          Lessons, parents, WhatsApp and billing in one system
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Heebo', data: heeboBold, style: 'normal', weight: 700 },
        { name: 'Heebo', data: heeboRegular, style: 'normal', weight: 400 },
      ],
    },
  )
}
