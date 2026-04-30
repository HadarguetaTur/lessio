-- Tighten homework-media storage: only upload/delete within own org folder (first path segment = organization_id).
-- Public SELECT unchanged so shared links (e.g. WhatsApp) keep working.

DROP POLICY IF EXISTS "authenticated users can upload homework media" ON storage.objects;
DROP POLICY IF EXISTS "authenticated users can delete homework media" ON storage.objects;

CREATE POLICY "org members upload homework media to org folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'homework-media'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM profiles
      WHERE id = auth.uid() AND is_active = true
      LIMIT 1
    )
  );

CREATE POLICY "org members delete homework media in org folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'homework-media'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text
      FROM profiles
      WHERE id = auth.uid() AND is_active = true
      LIMIT 1
    )
  );
