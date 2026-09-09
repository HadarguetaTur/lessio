/**
 * Marketing used to ride in `topic`.
 *
 * `createBroadcastAction` classified only `message`. But `topic` is body
 * parameter {{2}} of the UTILITY `class_update` template
 * (`broadcastBodyParams`), owner-controlled, 80 characters, and delivered
 * verbatim. So:
 *
 *   message = "השיעור עבר לחדר 2"        -> promotional: false
 *   topic   = "מבצע הרשמה: 50% הנחה"     -> never looked at
 *
 * `checkCampaignAllowed` therefore never raised
 * `promotional_content_in_update`, `categoryOf('class_update')` stayed
 * 'update', and `consentRefusal` admitted every parent who had never opted
 * into marketing — the same words refused in `message`.
 *
 * This test pins the property at the level that matters: whatever the compose
 * action classifies must cover every field that reaches a template BODY.
 */

import { describe, expect, it } from 'vitest'
import { classifyBroadcastText } from './classify'
import { broadcastBodyParams } from '@/lib/whatsapp/approvedTemplates'

const BENIGN_MESSAGE = 'השיעור עבר לחדר 2'
const PROMO_TOPIC = 'מבצע הרשמה: 50% הנחה לקורס החדש'

/** Exactly what the action now feeds the classifier. */
function classifiedText(topic: string, message: string): string {
  return [topic, message].filter(Boolean).join('\n')
}

describe('broadcast content classification covers every body field', () => {
  it('topic really does reach the class_update body', async () => {
    const params = broadcastBodyParams('class_update', 'he', {
      org_name: 'סטודיו',
      topic: PROMO_TOPIC,
      message: BENIGN_MESSAGE,
    })
    // {{2}} — verbatim, not summarised, not dropped.
    expect(params[1]).toBe(PROMO_TOPIC)
  })

  it('the old, message-only classification missed it', async () => {
    const before = await classifyBroadcastText('org-1', BENIGN_MESSAGE)
    expect(before.promotional).toBe(false)
  })

  it('classifying every body field catches it', async () => {
    const after = await classifyBroadcastText(
      'org-1',
      classifiedText(PROMO_TOPIC, BENIGN_MESSAGE)
    )
    expect(after.promotional).toBe(true)
  })

  it('still passes an ordinary service update', async () => {
    const ordinary = await classifyBroadcastText(
      'org-1',
      classifiedText('שינוי בחדר', BENIGN_MESSAGE)
    )
    expect(ordinary.promotional).toBe(false)
  })
})
