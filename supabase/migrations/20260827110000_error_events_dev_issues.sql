-- ── Error telemetry and recurring-bug detection ──────────────────────────────
-- Sentry has been installed since Sprint 23 but is almost entirely passive:
-- the four error boundaries only console.error, there is no global-error.tsx,
-- and the house `return { error: string }` convention in Server Actions means
-- the most common class of production failure never becomes an exception at
-- all. In practice we learn about bugs when a customer tells us.
--
-- error_events is the raw feed: one row per failure, fingerprinted so the same
-- bug from twenty different users collapses into one group. dev_issues is what
-- that feed promotes itself into once a fingerprint crosses a threshold — the
-- thing a human (or Claude Code, via the GitHub issue) actually works on.
--
-- Why our own table rather than reading Sentry's API: no token to rotate, the
-- detection cron is one SQL group-by, the GitHub issue body is assembled from
-- rows we control, and the operator can see the feed in /admin. Sentry stays
-- for stack-level debugging — dev_issues links out to it.

CREATE TABLE error_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable hash of (name + normalized message + route|digest). The grouping key.
  fingerprint     text        NOT NULL,
  name            text,
  message         text,
  route           text,
  -- Next's own error id, shown to the user in the boundary. Kept so a customer
  -- quoting "Error ID: 1a2b3c" can be matched to the event they hit.
  digest          text,
  source          text        NOT NULL CHECK (source IN ('server', 'client', 'edge')),
  -- Nullable and SET NULL: plenty of failures happen with no session (a logged
  -- out page, a webhook), and an event must outlive the org for blast-radius
  -- counting to stay honest.
  organization_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  url             text,
  user_agent      text,
  stack           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_error_events"
  ON error_events AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- The detection cron's only query: events for a fingerprint in a time window.
CREATE INDEX idx_error_events_fingerprint_created
  ON error_events (fingerprint, created_at DESC);

-- The 30-day sweep at the end of the same cron.
CREATE INDEX idx_error_events_created
  ON error_events (created_at);

COMMENT ON TABLE error_events IS
  'Raw production error feed, fingerprinted for grouping; service-role only. Swept after 30 days by the error-monitor cron.';

CREATE TABLE dev_issues (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE is the anti-duplicate guarantee: the cron upserts on it, so a
  -- fingerprint can never open a second issue no matter how often it fires.
  -- NULL for an issue a human opened by hand, which has no fingerprint.
  fingerprint         text        UNIQUE,
  title               text        NOT NULL,
  status              text        NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open', 'investigating', 'fixed', 'wont_fix')),
  severity            text        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  event_count         integer     NOT NULL DEFAULT 0,
  -- How many distinct orgs hit it. A bug that breaks one org is a support
  -- ticket; the same bug across five is a production incident.
  org_count           integer     NOT NULL DEFAULT 0,
  first_seen          timestamptz,
  last_seen           timestamptz,
  sample_stack        text,
  github_issue_number integer,
  github_issue_url    text,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_dev_issues"
  ON dev_issues AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX idx_dev_issues_status_last_seen
  ON dev_issues (status, last_seen DESC);

CREATE TRIGGER set_dev_issues_updated_at
  BEFORE UPDATE ON dev_issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE dev_issues IS
  'Recurring production bugs promoted from error_events, plus manually opened ones; mirrored to GitHub issues.';

-- Many tickets can point at one issue: five customers reporting the same broken
-- button is one bug, and fixing it should be able to answer all five at once.
ALTER TABLE support_tickets
  ADD COLUMN dev_issue_id uuid REFERENCES dev_issues(id) ON DELETE SET NULL;

CREATE INDEX idx_support_tickets_dev_issue
  ON support_tickets (dev_issue_id)
  WHERE dev_issue_id IS NOT NULL;

COMMENT ON COLUMN support_tickets.dev_issue_id IS
  'The dev issue this ticket is a report of, when one has been identified. Many tickets to one issue.';
