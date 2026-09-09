/**
 * The preparation steps an owner ticks off before opening Meta's Security
 * Centre to verify their business (settings → WhatsApp → verification & trust).
 *
 * Lessio never collects the documents themselves: Meta forbids a tech provider
 * from submitting Business Verification on a customer's behalf. The list is
 * what an Israeli small business is actually asked for, in the order Meta
 * checks it. Stored on organizations.wa_verification_checklist as
 * { <id>: <ISO timestamp> }.
 */
export const VERIFICATION_CHECKLIST_IDS = [
  'legal_document',
  'address_proof',
  'website_or_domain',
  'matching_name',
] as const

export type VerificationChecklistId = (typeof VERIFICATION_CHECKLIST_IDS)[number]
