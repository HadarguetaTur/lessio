/**
 * Outbound acquisition engine — row types.
 *
 * Hand-written, like every other lib in this repo (there are no generated DB
 * types). Keep in step with supabase/migrations/20260907120000_outbound_engine.sql.
 */

export type OutboundLocale = 'he' | 'en'

export const PROSPECT_STATUSES = [
  'queued',
  'claimed',
  'sent',
  'failed',
  'replied',
  'interested',
  'not_interested',
  'unsubscribed',
  'bounced',
  'suppressed',
  'converted',
] as const
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number]

export const REPLY_CLASSIFICATIONS = [
  'interested',
  'not_interested',
  'unsubscribe',
  'auto_reply',
  'bounce',
  'unknown',
] as const
export type ReplyClassification = (typeof REPLY_CLASSIFICATIONS)[number]

export type SuppressionReason = 'unsubscribed' | 'bounced' | 'manual' | 'replied_negative'

export interface Campaign {
  id: string
  name: string
  subject: string
  body_text: string
  locale: OutboundLocale
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Prospect {
  id: string
  campaign_id: string
  email: string
  first_name: string | null
  last_name: string | null
  company: string | null
  phone: string | null
  locale: OutboundLocale
  personal_line: string | null
  subject_area: string | null
  source_url: string | null
  metadata: Record<string, unknown>
  status: ProspectStatus
  send_attempts: number
  claimed_at: string | null
  sent_at: string | null
  replied_at: string | null
  last_reply_class: string | null
  platform_lead_id: string | null
  demo_email_sent_at: string | null
  import_batch_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type PlatformLeadStatus = 'new' | 'contacted' | 'qualified' | 'trial' | 'won' | 'lost'

export interface PlatformLead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  company: string | null
  status: PlatformLeadStatus
  notes: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  prospect_id: string | null
  converted_org_id: string | null
  converted_at: string | null
  created_at: string
  updated_at: string
}

export interface InboundMessageRow {
  id: string
  prospect_id: string | null
  from_email: string | null
  subject: string | null
  body: string | null
  classification: string | null
  created_at: string
}
