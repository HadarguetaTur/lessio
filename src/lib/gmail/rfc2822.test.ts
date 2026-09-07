import { describe, expect, it } from 'vitest'
import { buildRfc2822Message } from './index'

function decode(raw: string): string {
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

describe('buildRfc2822Message', () => {
  it('sends html alone when there is no text part', () => {
    const msg = decode(buildRfc2822Message({ from: 'a@x.com', to: 'b@y.com', subject: 'Hi', html: '<p>hi</p>' }))
    expect(msg).toContain('Content-Type: text/html; charset="UTF-8"')
    expect(msg).not.toContain('multipart/alternative')
    expect(msg).not.toContain('Message-ID')
  })

  it('carries a Message-ID and a text/plain alternative for a cold email', () => {
    const msg = decode(
      buildRfc2822Message({
        from: 'a@x.com',
        to: 'b@y.com',
        subject: 'שלום',
        html: '<p>שלום</p>',
        text: 'שלום',
        messageId: '<abc@getlessio.com>',
      })
    )
    expect(msg).toContain('Message-ID: <abc@getlessio.com>')
    expect(msg).toContain('Content-Type: multipart/alternative; boundary="alt_')
    expect(msg.indexOf('text/plain')).toBeLessThan(msg.indexOf('text/html'))
    expect(msg).toContain(`Subject: =?utf-8?B?${Buffer.from('שלום').toString('base64')}?=`)
  })

  it('wraps in multipart/mixed when there are attachments', () => {
    const msg = decode(
      buildRfc2822Message({
        from: 'a@x.com',
        to: 'b@y.com',
        subject: 'Hi',
        html: '<p>hi</p>',
        text: 'hi',
        attachments: [{ filename: 'f.pdf', content: 'AAAA' }],
      })
    )
    expect(msg).toContain('Content-Type: multipart/mixed; boundary="mixed_')
    expect(msg).toContain('multipart/alternative')
    expect(msg).toContain('Content-Disposition: attachment; filename="f.pdf"')
  })
})
