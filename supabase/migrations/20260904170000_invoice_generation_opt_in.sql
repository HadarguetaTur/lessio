-- Make Lessio's PDF invoice generation an explicit opt-in, off by default.
--
-- Context: invoice generation has never actually run in production — it failed
-- silently for every org since Sprint 27 (two stacked bugs, fixed in the same
-- change as this migration). The moment those fixes deploy, every bill approval
-- would begin issuing a numbered Lessio invoice.
--
-- That is not wanted by default. Lessio is not an invoicing system: the one
-- live customer issues invoices through Grow, outside the product, and a second
-- independently numbered series generated here would sit in parallel to the
-- books that actually count. No org in production has a receipt provider
-- configured either.
--
-- Defaulting to false preserves exactly the behaviour production has today
-- (no invoices), so the bug fixes are safe to deploy, while an org that does
-- want Lessio to issue documents can turn it on deliberately.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS invoice_generation_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.invoice_generation_enabled IS
  'When true, approving a monthly bill issues a Lessio PDF tax invoice and '
  'consumes a number from invoice_counters. Off by default: most orgs invoice '
  'through their own provider, and a parallel numbered series is an accounting '
  'hazard rather than a feature.';
