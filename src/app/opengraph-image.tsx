import { ImageResponse } from 'next/og'

export const alt = 'LESSIO — תשתית עסקית למורים פרטיים ומרכזי למידה'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const [heeboBold, heeboRegular] = await Promise.all([
    fetch(new URL('../../public/fonts/Heebo-Bold.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    ),
    fetch(new URL('../../public/fonts/Heebo-Regular.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer(),
    ),
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
          background:
            'linear-gradient(135deg, #0d9488 0%, #059669 45%, #7c3aed 100%)',
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
              background: 'rgba(255,255,255,0.18)',
              border: '2px solid rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 80,
              fontWeight: 700,
              color: 'white',
              lineHeight: 1,
            }}
          >
            L
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
          הכאוס התפעולי עולה כסף. Lessio שמה לזה סוף.
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
          תשתית עסקית למורים פרטיים ומרכזי למידה
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
