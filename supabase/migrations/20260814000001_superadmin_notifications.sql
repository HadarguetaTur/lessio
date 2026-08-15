-- Sprint 31 Story 4b: platform-level notifications for superadmins.
-- Superadmin profiles have no organization, and some events (e.g. a WhatsApp
-- webhook arriving for an unknown phone_number_id) have no org to attribute to.
-- RLS on in_app_notifications is deny-all (service-role access only), so a
-- nullable organization_id is safe.

ALTER TABLE in_app_notifications ALTER COLUMN organization_id DROP NOT NULL;
