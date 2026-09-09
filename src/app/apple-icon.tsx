import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          border: '6px solid #334155',
          borderRadius: 42,
          position: 'relative',
        }}
      >
        <div style={{ width: 94, height: 104, display: 'flex', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 4, left: 4, width: 28, height: 92, borderRadius: 20, background: '#2dd4bf' }} />
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 86, height: 28, borderRadius: 20, background: 'linear-gradient(90deg, #2dd4bf 0%, #8b5cf6 100%)' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderRadius: 99, background: '#a78bfa' }} />
        </div>
      </div>
    ),
    { ...size },
  )
}
