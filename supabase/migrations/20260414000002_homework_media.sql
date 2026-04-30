-- ── Supabase Storage: homework-media bucket ──────────────────────────────────
-- Public bucket for homework attachment files (images, videos, PDFs).
-- Files are stored at: {orgId}/{uuid}.{ext}
INSERT INTO storage.buckets (id, name, public)
VALUES ('homework-media', 'homework-media', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated org members can upload files
CREATE POLICY "authenticated users can upload homework media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'homework-media');

-- Anyone (including parents via WhatsApp link) can read files
CREATE POLICY "public read homework media"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'homework-media');

-- Authenticated org members can delete their own files
CREATE POLICY "authenticated users can delete homework media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'homework-media');

-- ── homework_templates: add media columns ─────────────────────────────────────
ALTER TABLE homework_templates
  ADD COLUMN media_url  text,
  ADD COLUMN media_type text
    CHECK (media_type IN ('image', 'video', 'document'));

-- ── homework_assignments: add media columns (denormalized from template) ──────
ALTER TABLE homework_assignments
  ADD COLUMN media_url  text,
  ADD COLUMN media_type text
    CHECK (media_type IN ('image', 'video', 'document'));
