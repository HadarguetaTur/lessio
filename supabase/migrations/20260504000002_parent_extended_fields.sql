-- Sprint: parent intake — secondary phone, address, relation type for billing/contact context
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS second_phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS relation_type text CHECK (
    relation_type IS NULL OR relation_type IN ('mother', 'father', 'guardian', 'other')
  );
