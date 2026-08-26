'use client'

/**
 * What the message actually looks like in WhatsApp.
 *
 * The old preview was a <pre> of the substituted body, which answered "is my
 * placeholder spelled right" but not "does this read well to a parent" — and
 * said nothing at all about the buttons, which are now the whole point of
 * several of these messages. This renders the real thing: a bubble on the
 * chat's wallpaper, the body, a timestamp, and the buttons underneath as
 * WhatsApp draws them.
 *
 * Presentational only. Labels and body arrive resolved from the card, so the
 * preview cannot disagree with what the editor above it is showing.
 */

import { ExternalLink } from 'lucide-react'

export type PreviewButton = { label: string; kind: 'quick_reply' | 'url' }

interface WhatsAppPreviewProps {
  body: string
  buttons?: PreviewButton[]
  /** Message language — drives text direction, not the app's own locale. */
  locale: 'he' | 'en'
}

export function WhatsAppPreview({ body, buttons = [], locale }: WhatsAppPreviewProps) {
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    <div
      dir={dir}
      className="rounded-md p-3"
      // WhatsApp's own chat ground, so the bubble reads as a bubble rather than
      // as a box on a form.
      style={{ backgroundColor: '#e5ddd5' }}
    >
      <div className="mx-auto max-w-sm">
        <div
          className="overflow-hidden rounded-lg shadow-sm"
          style={{ backgroundColor: '#ffffff' }}
        >
          <div className="px-3 pt-2 pb-1">
            <p className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-900">
              {body}
            </p>
            <p className="mt-1 text-[10px] text-gray-400" style={{ textAlign: 'end' }}>
              {/* A fixed time, not the clock: a preview that ticks looks live. */}
              10:24
            </p>
          </div>

          {buttons.length > 0 && (
            <div className="border-t" style={{ borderColor: '#e9edef' }}>
              {buttons.map((button, i) => (
                <div
                  key={`${button.label}-${i}`}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium ${
                    i > 0 ? 'border-t' : ''
                  }`}
                  style={{ color: '#00a5f4', borderColor: '#e9edef' }}
                >
                  {button.kind === 'url' && <ExternalLink size={13} aria-hidden />}
                  <span className="truncate">{button.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
