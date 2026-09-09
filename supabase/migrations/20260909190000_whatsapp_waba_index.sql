-- Route WABA-level webhooks without a sequential scan, and admit that a WABA
-- can belong to more than one organization.
--
-- organizations.whatsapp_phone_number_id has a unique index; whatsapp_waba_id
-- had no index at all, even though every message_template_status_update and
-- account_update webhook is routed by it. Meta allows several phone numbers
-- under one WhatsApp Business Account, so a customer running two studios
-- legitimately produces two Lessio orgs sharing one waba_id — which is why this
-- index is deliberately NOT unique.
--
-- The lookup in src/app/api/whatsapp/webhook/route.ts used .maybeSingle(), which
-- PostgREST answers with an error as soon as a second row matches: both orgs
-- then stopped receiving template-approval and health updates forever, with no
-- signal. That code now reads a list; this index makes the read cheap.

create index if not exists idx_organizations_whatsapp_waba_id
  on organizations (whatsapp_waba_id)
  where whatsapp_waba_id is not null;

comment on index idx_organizations_whatsapp_waba_id is
  'Routes WABA-level WhatsApp webhooks (template status, account health). Not unique: one WABA may hold several numbers, hence several orgs.';
