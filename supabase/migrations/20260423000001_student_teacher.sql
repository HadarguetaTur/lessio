-- Add teacher assignment to students table
-- teacher_id is nullable; ON DELETE SET NULL so removing a teacher doesn't delete students
ALTER TABLE students
  ADD COLUMN teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL;

CREATE INDEX idx_students_teacher_id ON students(teacher_id);
