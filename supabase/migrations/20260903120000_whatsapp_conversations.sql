-- ── WhatsApp conversations: full transcript + human takeover ─────────────────
--
-- Until now nothing kept what the bot and a parent actually said to each other.
-- conversation_log records only the AI-fallback branch, whatsapp_processed_messages
-- keeps ids without bodies, and outbound sends were not recorded at all. Staff
-- could not read a conversation, let alone answer one.
--
-- Two tables:
--   whatsapp_messages  — the transcript, both directions, every origin
--   whatsapp_takeovers — "a human is handling this one, bot stay quiet"
--
-- There is no backfill: the transcript starts the moment this ships.

CREATE TABLE whatsapp_messages (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The conversation key. Normalized E.164, same shape parents.phone holds, so
  -- a thread survives the parent record being renamed, re-linked or deleted.
  phone              text        NOT NULL,

  direction          text        NOT NULL CHECK (direction IN ('in', 'out')),

  -- Who produced an outbound message. NULL on inbound.
  --   bot   — a deterministic webhook reply (menus, cancellation, balance…)
  --   ai    — the AI assistant fallback
  --   staff — a person typing in the dashboard
  --   cron  — a business-initiated send (reminders, payment requests, dunning)
  origin             text        CHECK (origin IN ('bot', 'ai', 'staff', 'cron')),

  -- Best-effort denormalization, filled after resolveSender. Both stay NULL for
  -- a sender we could not place; the read path never depends on them.
  parent_id          uuid        REFERENCES parents(id) ON DELETE SET NULL,
  sender_role        text        CHECK (sender_role IN ('parent', 'student', 'teacher', 'staff', 'unknown')),

  sent_by_profile_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,

  kind               text        NOT NULL DEFAULT 'text'
                                 CHECK (kind IN ('text', 'template', 'interactive', 'cta_url', 'media', 'unsupported')),

  -- Always readable text. Non-text messages carry a placeholder ('[template: …]',
  -- '[media: image]') so a thread renders without special-casing every kind.
  body               text        NOT NULL,

  -- Meta's own id. Inbound: the id we deduplicate on. Outbound: messages[0].id
  -- from the send response, which every sender used to discard.
  wa_message_id      text,

  status             text        NOT NULL DEFAULT 'sent'
                                 CHECK (status IN ('received', 'sent', 'failed')),

  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Serves both reads: the thread (org + phone, newest first) and the conversation
-- list, which is a DISTINCT ON (phone) over the same leading columns.
CREATE INDEX idx_whatsapp_messages_thread
  ON whatsapp_messages (organization_id, phone, created_at DESC);

COMMENT ON TABLE whatsapp_messages IS
  'Full WhatsApp transcript per org. Written fire-and-forget: a failed insert never breaks a send. Deno Edge Function sends (cron reminders) are NOT logged yet — see the conversations backlog.';

CREATE TABLE whatsapp_takeovers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone               text        NOT NULL,
  taken_by_profile_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- The upsert target: one takeover per conversation. A second staff message
  -- extends the existing window rather than racing a duplicate row.
  CONSTRAINT whatsapp_takeovers_org_phone_unique UNIQUE (organization_id, phone)
);

COMMENT ON TABLE whatsapp_takeovers IS
  'A staff member is answering this conversation by hand; the webhook skips its auto-reply while a row is live. Same lifecycle as support_sessions: presence is the state, expiry is read-time, release is a DELETE.';

ALTER TABLE whatsapp_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_takeovers ENABLE ROW LEVEL SECURITY;

-- Reads only, per role. Writes stay service-role: everything that appends to a
-- transcript is server-side (webhook, senders, server actions).
--
-- Scope is the whole organization for all three roles, matching
-- 20260820000003_portal_messages_realtime.sql. The teacher-scoped conversation
-- list is built by the page query through the service-role client; narrowing
-- these policies would not hide anything from a teacher, it would only stop the
-- live updates on the threads they can already see.
DO $$
DECLARE
  tbl  text;
  role text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['whatsapp_messages', 'whatsapp_takeovers'] LOOP
    FOREACH role IN ARRAY ARRAY['owner', 'admin', 'teacher'] LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        tbl || '_' || role || '_read', tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING ('
        || 'organization_id = (auth.jwt() ->> ''org_id'')::uuid '
        || 'AND (auth.jwt() ->> ''role'') = %L)',
        tbl || '_' || role || '_read', tbl, role
      );
    END LOOP;
  END LOOP;
END
$$;

-- Publish for Realtime, so the conversation list and the "handled by a person"
-- badge update without a reload. Replica identity stays at the default: a
-- transcript only ever gains rows, and a takeover is created or deleted.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['whatsapp_messages', 'whatsapp_takeovers'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END
$$;
