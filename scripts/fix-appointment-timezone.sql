-- One-off data fix: appointments booked through the website were saved 8 hours late.
--
-- Why: the booking page sent the time without a timezone ("2026-11-22T21:00:00").
-- The production backend runs on UTC, so the database driver saved 9:00 PM as
-- 9:00 PM UTC (= 5:00 AM the next day in Manila). Fixed in code by
-- fix/appointment-timezone; this script repairs the rows saved before that.
--
-- Which rows: only appointments whose LAST time was set through the website
-- with a time WITHOUT a timezone (as written in their audit row) AND whose saved
-- value is exactly that time read as UTC. Seed/demo appointments (no audit row)
-- and anything booked after the fix (sent with +08:00) are never touched.
-- Running it again finds nothing (the saved value no longer matches).
--
-- Run ON THE SERVER from /opt/smarthealth-hub, after deploy.sh and a backup:
--   Preview (changes nothing):
--     dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/fix-appointment-timezone.sql
--   Apply:
--     dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v apply=1' < scripts/fix-appointment-timezone.sql

\set ON_ERROR_STOP on
\pset footer off

BEGIN;

CREATE TEMP TABLE tz_fix ON COMMIT DROP AS
WITH last_set AS (
    -- The newest audit row that set each appointment's time (booking or reschedule).
    SELECT DISTINCT ON (l.entity_id)
           l.entity_id AS appointment_id,
           CASE WHEN l.action = 'CREATE' THEN l.metadata ->> 'scheduled_at'
                ELSE l.metadata -> 'changed_fields' ->> 'scheduled_at'
           END AS sent
    FROM audit_logs l
    WHERE l.entity_type = 'appointment'
      AND (l.action = 'CREATE'
           OR (l.action = 'UPDATE' AND l.metadata -> 'changed_fields' ? 'scheduled_at'))
    ORDER BY l.entity_id, l.created_at DESC
)
SELECT a.id, a.appointment_type, a.status, a.scheduled_at AS saved_at
FROM appointments a
JOIN last_set s ON s.appointment_id = a.id
WHERE s.sent ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$'   -- sent without a timezone
  AND a.scheduled_at = (s.sent::timestamp AT TIME ZONE 'UTC');      -- and saved as if it were UTC

\echo
\echo 'Appointments saved 8 hours late:'
SELECT count(*) AS to_fix FROM tz_fix;

\echo 'Each one, in Manila time (no patient names):'
SELECT appointment_type,
       status,
       to_char(saved_at AT TIME ZONE 'Asia/Manila', 'Mon DD, HH12:MI AM') AS shows_now,
       to_char((saved_at - interval '8 hours') AT TIME ZONE 'Asia/Manila', 'Mon DD, HH12:MI AM') AS will_show
FROM tz_fix
ORDER BY saved_at;

UPDATE appointments a
SET scheduled_at = a.scheduled_at - interval '8 hours'
FROM tz_fix f
WHERE a.id = f.id;

-- Record the repair in the audit log (append-only; one summary row).
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, ip_address)
SELECT gen_random_uuid(), NULL, 'UPDATE', 'appointment_timezone_fix', NULL,
       jsonb_build_object(
           'appointments_moved_back_8h', (SELECT count(*) FROM tz_fix),
           'appointment_ids', (SELECT coalesce(jsonb_agg(id), '[]'::jsonb) FROM tz_fix),
           'reason', 'Booked without a timezone on a UTC server; saved 8 hours late.'
       ),
       NULL
WHERE EXISTS (SELECT 1 FROM tz_fix);

\if :{?apply}
COMMIT;
\echo 'APPLIED: the appointments above now show the "will_show" time.'
\else
ROLLBACK;
\echo 'PREVIEW ONLY: nothing was changed. To apply, run again with -v apply=1'
\endif
