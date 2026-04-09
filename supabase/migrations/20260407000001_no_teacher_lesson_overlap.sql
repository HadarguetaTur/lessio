-- Migration: 20260407000001_no_teacher_lesson_overlap.sql
-- DB-level defense-in-depth against duplicate scheduled lessons for the same teacher.
--
-- Application layer (createLesson, confirmBooking) already prevents overlap at query time,
-- but two truly concurrent requests can both pass the app check before either inserts.
-- This EXCLUDE constraint makes the DB reject the second insert unconditionally.
--
-- Requires btree_gist (available by default in Supabase).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE lessons
  ADD CONSTRAINT no_teacher_lesson_overlap
  EXCLUDE USING gist (
    teacher_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status != 'cancelled');
