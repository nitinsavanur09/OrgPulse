-- OrgPulse Supabase schema — run once in SQL Editor
-- Tables store only aggregated metrics, never raw Salesforce record data

CREATE TABLE connected_orgs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesforce_org_id VARCHAR(18) UNIQUE NOT NULL,
  org_name          TEXT,
  instance_url      TEXT,
  status            TEXT DEFAULT 'connected',
  connected_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scan_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES connected_orgs(id),
  status             TEXT DEFAULT 'pending',
  ai_readiness_index SMALLINT,
  has_hard_blocker   BOOLEAN,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scan_domain_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id UUID REFERENCES scan_runs(id),
  domain      TEXT NOT NULL,
  score       SMALLINT,
  is_blocker  BOOLEAN DEFAULT FALSE
);

CREATE TABLE scan_findings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id  UUID REFERENCES scan_runs(id),
  domain       TEXT,
  severity     TEXT,
  title        TEXT,
  description  TEXT,
  evidence     TEXT,
  effort_days  NUMERIC(4,1),
  impact_score SMALLINT
);

-- Optional: store client-specific scan configs (no org data, just config shape)
CREATE TABLE scan_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES connected_orgs(id),
  config_json JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  is_active   BOOLEAN DEFAULT TRUE
);

-- Enable Realtime for scan_runs so the pipeline can be observed live
ALTER TABLE scan_runs REPLICA IDENTITY FULL;
