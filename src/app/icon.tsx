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
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 9,
          position: 'relative',
        }}
      >
        <div style={{ width: 16, height: 18, display: 'flex', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 1, left: 1, width: 5, height: 16, borderRadius: 4, background: '#2dd4bf' }} />
          <div style={{ position: 'absolute', bottom: 1, left: 1, width: 14, height: 5, borderRadius: 4, background: 'linear-gradient(90deg, #2dd4bf 0%, #8b5cf6 100%)' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 5, height: 5, borderRadius: 99, background: '#a78bfa' }} />
        </div>
      </div>
    ),
    { ...size },
  )
}
