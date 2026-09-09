-- Make a retried import idempotent.
--
-- The import UI posts the previewed rows to /api/import/execute. If that call
-- fails or times out, the natural thing to do is press the button again — and
-- the preview it re-posts is stale (every `existingId` is still null), so
-- everything that did land got inserted a second time.
--
-- The client now stamps each preview with a key. The first execute claims the
-- key; a retry finds it already claimed and replays the stored result instead
-- of writing anything.

CREATE TABLE import_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idempotency_key   text NOT NULL,
  entity_type       text NOT NULL,
  row_count         integer NOT NULL DEFAULT 0,
  -- running | completed | failed
  status            text NOT NULL DEFAULT 'running',
  result            jsonb,
  created_by        uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

COMMENT ON TABLE import_batches IS
  'One row per import execution. The unique idempotency key makes a retry of the same preview a no-op replay instead of a duplicate import.';

-- The claim: a second execute with the same key loses this insert and reads
-- the winner's result.
CREATE UNIQUE INDEX idx_import_batches_org_key
  ON import_batches (organization_id, idempotency_key);

CREATE INDEX idx_import_batches_org_created
  ON import_batches (organization_id, created_at DESC);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- Written only by the service role from the import route; owners and admins may
-- read their own org's import history.
CREATE POLICY import_batches_select_own_org ON import_batches
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
