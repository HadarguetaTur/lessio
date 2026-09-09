-- Payment reference history.
--
-- charges.payment_reference holds ONE reference: the most recent checkout minted
-- for that charge. Every send path overwrites it — the consolidated request, the
-- monthly bill send, the auto-send after a lesson, the parent screen. A parent
-- who pays the link from last week's WhatsApp message therefore arrives at
-- /api/payments/<provider> with a reference that no row carries any more, the
-- webhook finds no charges, and the money is invisible to Lessio while the
-- dunning cron keeps chasing it.
--
-- This table is the history: every reference ever minted for a charge stays
-- resolvable forever. It is written by a trigger rather than by application code
-- on purpose — a mint path that only sets the three columns on `charges` (and
-- every one of them does, including future ones) inherits the history without
-- being changed, so no provider or send path can opt out by omission.
--
-- `amount` records what the link was minted to collect FOR THIS CHARGE — its
-- outstanding balance at mint time, not the gross charge total. The webhook
-- validates the provider's amount against the sum of these, which is what the
-- parent was actually asked to pay after any partial cash payment.

CREATE TABLE charge_payment_references (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  charge_id         uuid          NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  payment_reference text          NOT NULL,
  payment_provider  text,
  payment_link      text,
  amount            numeric(10,2),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  -- Set when a newer link replaced this one. A superseded reference is still
  -- honoured when it is paid: superseding a link does not cancel it at the
  -- provider, and the parent cannot know we minted another one.
  superseded_at     timestamptz
);

CREATE UNIQUE INDEX charge_payment_references_charge_reference_unique
  ON charge_payment_references (charge_id, payment_reference);

-- The webhook lookup: one reference → every charge it covers.
CREATE INDEX charge_payment_references_reference_idx
  ON charge_payment_references (payment_reference);

CREATE INDEX charge_payment_references_org_created_idx
  ON charge_payment_references (organization_id, created_at DESC);

-- No policies: reads and writes both go through the service-role client.
ALTER TABLE charge_payment_references ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE charge_payment_references IS
  'Every payment reference ever minted for a charge. Written by trigger; service-role access only.';
COMMENT ON COLUMN charge_payment_references.amount IS
  'What this link was minted to collect for this charge: its outstanding balance at mint time.';

CREATE OR REPLACE FUNCTION record_charge_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_reference IS NULL THEN
    RETURN NEW;
  END IF;

  -- `AFTER UPDATE OF payment_reference` also fires when the column is in the SET
  -- list with an unchanged value, which every "resend the same link" does.
  IF TG_OP = 'UPDATE' AND NEW.payment_reference IS NOT DISTINCT FROM OLD.payment_reference THEN
    RETURN NEW;
  END IF;

  UPDATE charge_payment_references
     SET superseded_at = now()
   WHERE charge_id = NEW.id
     AND superseded_at IS NULL
     AND payment_reference <> NEW.payment_reference;

  INSERT INTO charge_payment_references (
    organization_id, charge_id, payment_reference, payment_provider, payment_link, amount
  )
  VALUES (
    NEW.organization_id,
    NEW.id,
    NEW.payment_reference,
    NEW.payment_provider,
    NEW.payment_link,
    GREATEST(COALESCE(NEW.amount, 0) - COALESCE(NEW.amount_paid, 0), 0)
  )
  ON CONFLICT (charge_id, payment_reference) DO UPDATE
    SET payment_link     = EXCLUDED.payment_link,
        payment_provider = EXCLUDED.payment_provider,
        superseded_at    = NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_payment_reference_history
  AFTER INSERT OR UPDATE OF payment_reference ON charges
  FOR EACH ROW
  EXECUTE FUNCTION record_charge_payment_reference();

-- Backfill: the reference each charge carries right now. Older ones are gone —
-- they were overwritten in place and were never recorded anywhere.
INSERT INTO charge_payment_references (
  organization_id, charge_id, payment_reference, payment_provider, payment_link, amount
)
SELECT
  organization_id,
  id,
  payment_reference,
  payment_provider,
  payment_link,
  GREATEST(COALESCE(amount, 0) - COALESCE(amount_paid, 0), 0)
FROM charges
WHERE payment_reference IS NOT NULL
ON CONFLICT (charge_id, payment_reference) DO NOTHING;
