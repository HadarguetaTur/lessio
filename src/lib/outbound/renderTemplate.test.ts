import { describe, expect, it } from 'vitest'
import { renderCampaignMessage, renderTemplate, textToHtml } from './renderTemplate'
import { makeProspect } from './testFixtures'
import type { Campaign } from './types'

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
  const prospect = makeProspect({
    id: 'p', campaign_id: 'c', company: 'סטודיו דנה', status: 'claimed', send_attempts: 0, sent_at: null,
    personal_line: 'ראיתי שאת מכינה לבגרות במתמטיקה.',
  })

  it('renders subject, text and html', () => {
    const m = renderCampaignMessage(campaign, prospect)
    expect(m.subject).toBe('שאלה על סטודיו דנה')
    expect(m.bodyText).toContain('היי דנה,\n\nראיתי שאת מכינה לבגרות במתמטיקה.\n\nבנינו משהו.')
    expect(m.bodyHtml).toContain('dir="rtl"')
    expect(m.bodyHtml).toContain('ראיתי שאת מכינה')
  })

  it('every cold email carries a way out', () => {
    const m = renderCampaignMessage(campaign, prospect)
    const path = `/u/${prospect.unsubscribe_token}`
    expect(m.bodyText).toContain(path)
    expect(m.bodyHtml).toContain(path)
    // Once. A second footer would read as a mistake.
    expect(m.bodyText.split(path)).toHaveLength(2)
  })

  it('a body that places the link itself keeps control of it', () => {
    const withLink: Campaign = { ...campaign, body_text: 'היי {{first_name}},\n\nלהסרה: {{unsubscribe_url}}' }
    const m = renderCampaignMessage(withLink, prospect)
    expect(m.bodyText.split(prospect.unsubscribe_token)).toHaveLength(2)
    expect(m.bodyText).not.toContain('לא רלוונטי?')
  })
})
