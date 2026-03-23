-- Sprint 4: payment request send metadata
-- Align charges schema with docs/schema.md and payment request logging.

alter table charges
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by_profile_id uuid references profiles(id);
