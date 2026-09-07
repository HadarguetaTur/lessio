import { describe, expect, it } from 'vitest'
import { renderCampaignMessage, renderTemplate, textToHtml } from './renderTemplate'
import type { Campaign, Prospect } from './types'

describe('renderTemplate', () => {
  it('substitutes flat and nested keys', () => {
    expect(renderTemplate('Hi {{first_name}} from {{metadata.city}}', { first_name: 'דנה', metadata: { city: 'חיפה' } }))
      .toBe('Hi דנה from חיפה')
  })

  it('tidies the punctuation a missing value leaves behind', () => {
    expect(renderTemplate('Hi {{first_name}},\nhow are you', { first_name: null })).toBe('Hi,\nhow are you')
  })

  it('collapses a line that held only a placeholder', () => {
    expect(renderTemplate('A\n\n{{personal_line}}\n\nB', {})).toBe('A\n\nB')
  })

  it('leaves unknown keys empty rather than literal', () => {
    expect(renderTemplate('x {{nope}} y', {})).toBe('x y')
  })
})

describe('textToHtml', () => {
  it('escapes and paragraphs', () => {
    const html = textToHtml('a <b>\n\nc & d')
    expect(html).toContain('a &lt;b&gt;')
    expect(html).toContain('c &amp; d')
    expect(html.match(/<p /g)?.length).toBe(2)
  })
})

describe('renderCampaignMessage', () => {
  const campaign: Campaign = {
    id: 'c', name: 'x', subject: 'שאלה על {{company}}', body_text: 'היי {{first_name}},\n\n{{personal_line}}\n\nבנינו משהו.',
    locale: 'he', is_active: true, created_at: '', updated_at: '',
  }
  const prospect = {
    id: 'p', campaign_id: 'c', email: 'dana@example.com', first_name: 'דנה', last_name: null, company: 'סטודיו דנה',
    phone: null, locale: 'he', personal_line: 'ראיתי שאת מכינה לבגרות במתמטיקה.', subject_area: null, source_url: null,
    metadata: {}, status: 'claimed', send_attempts: 0, claimed_at: null, sent_at: null, replied_at: null,
    last_reply_class: null, platform_lead_id: null, demo_email_sent_at: null, import_batch_id: null, notes: null,
    created_at: '', updated_at: '',
  } satisfies Prospect

  it('renders subject, text and html', () => {
    const m = renderCampaignMessage(campaign, prospect)
    expect(m.subject).toBe('שאלה על סטודיו דנה')
    expect(m.bodyText).toBe('היי דנה,\n\nראיתי שאת מכינה לבגרות במתמטיקה.\n\nבנינו משהו.')
    expect(m.bodyHtml).toContain('dir="rtl"')
    expect(m.bodyHtml).toContain('ראיתי שאת מכינה')
  })
})
