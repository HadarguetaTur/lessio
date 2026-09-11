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

export const OPENER_STATUSES = ['none', 'pending', 'generated', 'approved', 'failed'] as const
export type OpenerStatus = (typeof OPENER_STATUSES)[number]

/** Hebrew addresses a person by gender; unknown means the copy stays neutral. */
export type ProspectGender = 'f' | 'm'

export type MessageKind = 'cold_email' | 'reply' | 'demo_email' | 'followup'

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
  mailbox_id: string | null
  gender: ProspectGender | null
  opener_status: OpenerStatus
  opener_generated: string | null
  opener_model: string | null
  opener_error: string | null
  opener_claimed_at: string | null
  /** Bearer of /u/<token>; the row is deleted when it is used. */
  unsubscribe_token: string
  followup_stage: number
  next_followup_at: string | null
  followup_claimed_at: string | null
  followup_attempts: number
  last_inbound_at: string | null
  created_at: string
  updated_at: string
}

export const PLATFORM_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'trial', 'won', 'lost'] as const
export type PlatformLeadStatus = (typeof PLATFORM_LEAD_STATUSES)[number]

/** Why a lead was closed as lost; 'other' carries free text. */
export const LOST_REASONS = ['no_budget', 'no_need', 'competitor', 'no_response', 'other'] as const
export type LostReason = (typeof LOST_REASONS)[number]

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
  organization_id: string | null
  converted_org_id: string | null
  converted_at: string | null
  lost_reason: string | null
  owner_profile_id: string | null
  /** Founder-set reminder; a due one floats the lead to the top of the inbox. */
  next_action_at: string | null
  next_action_note: string | null
  created_at: string
  updated_at: string
}


/** One row of outbound_messages, as the lead card reads it. */
export interface OutboundMessage {
  id: string
  prospect_id: string | null
  direction: 'in' | 'out'
  kind: MessageKind
  mailbox_id: string | null
  from_email: string | null
  subject: string | null
  body: string | null
  classification: string | null
  error: string | null
  reviewed_at: string | null
  created_at: string
}

export interface InboundMessageRow {
  id: string
  prospect_id: string | null
  from_email: string | null
  subject: string | null
  body: string | null
  classification: string | null
  reviewed_at: string | null
  created_at: string
}
