INSERT INTO portal_otps (organization_id, phone, otp_hash, expires_at)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  '+972509876543',
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
  now() + interval '10 minutes'
);