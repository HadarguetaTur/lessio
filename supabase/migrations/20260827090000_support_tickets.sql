-- ── Customer support tickets ────────────────────────────────────────────────
-- An org owner or admin opens a support request against the Lessio platform —
-- from the in-app help widget or (Sprint 32 M2) the WhatsApp staff menu — and
-- the platform operator answers it from /admin/support.
--
-- This is the first channel a paying customer has to reach us in-product. Two
-- properties matter more than the schema itself:
--
--   1. A ticket is a *thread*, not a single message. The first customer message
--      is a support_ticket_messages row like any other, so a reply from either
--      side is the same insert and the detail view is one ordered query.
--   2. Tickets outlive notifications. in_app_notifications is swept after 30
--      days by the notification-cleanup cron, so notifications may only ever
--      carry a pointer (action_url) into these tables — never the content.
--
-- Support is deliberately NOT plan-gated: every org, including free and
-- read-only ones, can open a ticket. A customer who cannot pay us is exactly
-- the customer who most needs to reach us.

CREATE TABLE support_tickets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- SET NULL rather than CASCADE: a resolved ticket stays readable as operator
  -- history after the staff member who raised it leaves the org.
  created_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  subject           text        NOT NULL,
  status            text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  -- category/severity start NULL. The widget lets the customer pre-pick a
  -- category; AI triage (M2) fills or overrides both. Neither is required for a
  -- ticket to be answerable, so neither is NOT NULL.
  category          text        CHECK (category IN ('bug', 'question', 'feature_request', 'other')),
  severity          text        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source            text        NOT NULL
                                CHECK (source IN ('widget', 'whatsapp', 'auto')),
  -- Captured silently by the widget. "It's broken" is a far cheaper ticket to
  -- answer when we know which page they were on and in which browser.
  page_url          text,
  user_agent        text,
  ai_classified_at  timestamptz,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_ticket_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         uuid        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- 'system' is written by the app (status changes, "the bug you reported is
  -- fixed"); 'ai' is a self-service answer that did not satisfy the customer
  -- and is kept so the operator can see what was already tried.
  author_type       text        NOT NULL
                                CHECK (author_type IN ('customer', 'admin', 'ai', 'system')),
  author_profile_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  body              text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Server-action-only, via service role. The customer never queries these
-- directly: a ticket is visible to its org through /support, which resolves
-- org_id from the session, and to superadmins through /admin/support.
CREATE POLICY "deny_all_support_tickets"
  ON support_tickets AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE POLICY "deny_all_support_ticket_messages"
  ON support_ticket_messages AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- The customer's "my tickets" list reads exactly this.
CREATE INDEX idx_support_tickets_org_created
  ON support_tickets (organization_id, created_at DESC);

-- The operator queue reads exactly this. Partial, because resolved and closed
-- tickets are the bulk of the table over time and are never in the queue.
CREATE INDEX idx_support_tickets_status
  ON support_tickets (status, created_at DESC)
  WHERE status IN ('open', 'in_progress', 'waiting_on_customer');

-- Thread rendering: every message of one ticket, oldest first.
CREATE INDEX idx_support_ticket_messages_ticket
  ON support_ticket_messages (ticket_id, created_at);

CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE support_tickets IS
  'Customer support requests against the Lessio platform; service-role only, answered from /admin/support.';
COMMENT ON TABLE support_ticket_messages IS
  'Threaded messages on a support ticket, from the customer, the operator, the AI triage, or the system.';
