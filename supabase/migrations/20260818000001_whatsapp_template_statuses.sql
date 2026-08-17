-- Migration: 20260818000001_whatsapp_template_statuses.sql
-- Meta approval status for WhatsApp message templates.
--
-- Until now the two template systems never met: an org could rewrite its lesson
-- reminder in message_templates, but outside the 24h session window parents
-- still received Lessio's hardcoded copy from registerTemplates.ts — and nothing
-- anywhere recorded whether Meta had actually approved a template we were about
-- to send. sendSmartMessage named a template on faith.
--
-- This table is that record. It serves two kinds of row:
--   * org-authored submissions — `type`, `version` and `body_text` are set, and
--     the send path prefers the highest approved version over Lessio's built-in
--     template for the same type.
--   * Lessio's built-in registry — those columns stay NULL; the row exists only
--     so the settings page can show a status chip.
--
-- The primary key is (organization_id, template_name, language) because that is
-- exactly what a message_template_status_update webhook gives us: the WABA id
-- resolves the org, and the payload carries the name and language. Anything
-- keyed on `type` would be unresolvable from a webhook.

CREATE TABLE whatsapp_template_statuses (
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_name    text        NOT NULL,
  language         text        NOT NULL,
  -- Meta's own vocabulary, stored verbatim in upper case so a status Meta adds
  -- later lands as data instead of failing the upsert. Known values today:
  -- PENDING, APPROVED, REJECTED, PAUSED, DISABLED.
  status           text        NOT NULL,
  reason           text,

  -- Org-authored submissions only; NULL for Lessio's built-in registry.
  type             text,
  version          integer,
  -- The positional ({{1}}, {{2}}) form actually submitted to Meta. Kept so the
  -- settings page can tell that the org has edited the body since approval —
  -- the approved Meta copy and the live message_templates row then differ.
  body_text        text,
  -- The {{named}} variables the org's body used, in the order they became
  -- {{1}}, {{2}}, ... Meta only ever tells us positions, so without this the
  -- send path could not rebuild the parameter list. The order is derived from
  -- the org's own body rather than fixed per type, because the editable body
  -- and Lessio's built-in Meta template do not use the same variable sets
  -- (payment_reminder is the clearest case: {{amount}}/{{payment_link}} in the
  -- editable body vs parent_name/amount in the built-in template).
  var_order        text[],
  meta_template_id text,
  submitted_by     uuid        REFERENCES profiles(id),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, template_name, language),

  -- A submission is only meaningful with all of its columns; a built-in row must
  -- have none of them. Blocks half-written rows from either path.
  CONSTRAINT whatsapp_template_statuses_submission_complete CHECK (
    (type IS NULL     AND version IS NULL     AND body_text IS NULL     AND var_order IS NULL) OR
    (type IS NOT NULL AND version IS NOT NULL AND body_text IS NOT NULL AND var_order IS NOT NULL)
  ),
  CONSTRAINT whatsapp_template_statuses_version_positive CHECK (version IS NULL OR version >= 1)
);

ALTER TABLE whatsapp_template_statuses ENABLE ROW LEVEL SECURITY;

-- Service-role only, same posture as day_off_requests: the settings page is a
-- server component reading through createServiceRoleClient(), and the webhook
-- writes with no user session at all.
CREATE POLICY "deny_all_whatsapp_template_statuses"
  ON whatsapp_template_statuses AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- The send path asks "highest approved version for this org+type+language?" on
-- every out-of-window send, so this index is on the hot path, not just the UI.
CREATE INDEX idx_whatsapp_template_statuses_lookup
  ON whatsapp_template_statuses (organization_id, type, language, status);

COMMENT ON TABLE whatsapp_template_statuses IS
  'Meta approval status per WhatsApp template. Rows with type/version/body_text set are org-authored submissions the send path prefers over Lessio''s built-in templates; rows without them just track the built-in registry. Service-role only.';
