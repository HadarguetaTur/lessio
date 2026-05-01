import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #14b8a6 0%, #7c3aed 100%)',
          color: 'white',
          fontSize: 22,
          fontWeight: 700,
          borderRadius: 7,
          letterSpacing: '-0.02em',
        }}
      >
        L
      </div>
    ),
    { ...size },
  )
}
