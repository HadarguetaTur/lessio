-- Move the currency symbol out of message template bodies.
--
-- The built-in bodies used to hard-code '₪' in front of {{amount}} / {{total}}.
-- Every sender now passes those variables already formatted for the org's
-- currency and the recipient's locale (formatBotMoney), so a body that still
-- carries the literal symbol renders '₪₪250.00' — and an org on a non-ILS
-- currency was being sent a shekel sign regardless of its settings.
--
-- Orgs that customised a template kept whatever they typed, so their saved rows
-- need the same edit. Only the exact '₪{{amount}}' / '₪{{total}}' shapes (with
-- or without a space) are touched: a symbol the owner deliberately wrote
-- somewhere else in their copy is theirs to keep.
--
-- Forward-only. Release note: this changes wording an owner may have authored.

UPDATE message_templates
SET body_template = regexp_replace(
      body_template,
      '₪[[:space:]]?(\{\{(amount|total)\}\})',
      '\1',
      'g'
    ),
    updated_at = now()
WHERE body_template ~ '₪[[:space:]]?\{\{(amount|total)\}\}';
