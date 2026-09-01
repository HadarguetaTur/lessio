-- Read-only audit. Run in Supabase SQL Editor after the billing-cycle migration.
-- It intentionally changes no financial rows.

-- 1. Individual charges that should not have been created under monthly mode.
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  c.id AS charge_id,
  c.parent_id,
  c.lesson_id,
  c.charge_type,
  c.status,
  c.amount,
  c.amount_paid,
  c.sent_at,
  c.receipt_issued_at,
  c.created_at
FROM organizations o
JOIN charges c ON c.organization_id = o.id
WHERE o.billing_mode = 'monthly'
  AND c.charge_type IN ('lesson', 'cancellation')
  AND c.status IN ('pending', 'invoiced', 'paid')
ORDER BY o.name, c.created_at;

-- 2. Exact overlap: a lesson/cancellation charge and a monthly billing record
-- for the same student and captured billing period.
SELECT DISTINCT
  mb.organization_id,
  mb.id AS billing_record_id,
  mb.student_id,
  mb.period_start,
  mb.period_end,
  monthly_charge.id AS monthly_charge_id,
  monthly_charge.status AS monthly_status,
  individual_charge.id AS individual_charge_id,
  individual_charge.charge_type AS individual_type,
  individual_charge.status AS individual_status,
  individual_charge.lesson_id
FROM student_monthly_billing mb
JOIN lesson_students ls
  ON ls.organization_id = mb.organization_id
 AND ls.student_id = mb.student_id
JOIN lessons l
  ON l.id = ls.lesson_id
 AND (l.start_at AT TIME ZONE COALESCE(
       (SELECT timezone FROM organizations WHERE id = mb.organization_id),
       'Asia/Jerusalem'
     ))::date BETWEEN mb.period_start AND mb.period_end
JOIN charges individual_charge
  ON individual_charge.organization_id = mb.organization_id
 AND individual_charge.lesson_id = l.id
 AND individual_charge.charge_type IN ('lesson', 'cancellation')
 AND individual_charge.status IN ('pending', 'invoiced', 'paid')
LEFT JOIN charges monthly_charge
  ON monthly_charge.billing_record_id = mb.id
 AND monthly_charge.charge_type = 'monthly'
ORDER BY mb.organization_id, mb.period_start, mb.student_id;

-- Interpretation:
-- * pending/invoiced duplicate: review sent links and void the wrong demand.
-- * one side paid: never delete; void the open side and retain the audit trail.
-- * both sides paid or any receipt issued: manual refund/credit-note review.
