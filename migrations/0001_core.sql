CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  country_code varchar(2),
  currency_code varchar(3) NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code text,
  name text NOT NULL,
  department text,
  area text,
  job_family text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE UNIQUE INDEX jobs_org_code_unique
  ON jobs (organization_id, code)
  WHERE code IS NOT NULL;
CREATE INDEX jobs_org_idx ON jobs (organization_id);

CREATE TABLE methodology_versions (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  definition jsonb NOT NULL,
  content_owner text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX methodology_versions_org_unique
  ON methodology_versions (organization_id, code, version)
  WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX methodology_versions_global_unique
  ON methodology_versions (code, version)
  WHERE organization_id IS NULL;
CREATE INDEX methodology_versions_org_idx ON methodology_versions (organization_id);

CREATE TABLE valuations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL,
  methodology_version_id uuid NOT NULL REFERENCES methodology_versions(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT', 'IN_REVIEW', 'RETURNED', 'APPROVED', 'SUPERSEDED', 'CANCELLED')
  ),
  total_points numeric(18, 6),
  grade_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (job_id, version),
  FOREIGN KEY (job_id, organization_id)
    REFERENCES jobs(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX valuations_org_idx ON valuations (organization_id);
CREATE INDEX valuations_org_status_idx ON valuations (organization_id, status);
CREATE INDEX valuations_job_idx ON valuations (job_id);

CREATE TABLE valuation_decisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  valuation_id uuid NOT NULL,
  dimension_code text NOT NULL,
  selected_level_code text NOT NULL,
  source text NOT NULL DEFAULT 'MANUAL' CHECK (
    source IN ('MANUAL', 'AI_ACCEPTED', 'AI_MODIFIED', 'IMPORT')
  ),
  justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (valuation_id, dimension_code),
  FOREIGN KEY (valuation_id, organization_id)
    REFERENCES valuations(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX valuation_decisions_org_idx ON valuation_decisions (organization_id);
CREATE INDEX valuation_decisions_valuation_idx ON valuation_decisions (valuation_id);

CREATE TABLE valuation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  valuation_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (valuation_id, organization_id)
    REFERENCES valuations(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX valuation_events_org_idx ON valuation_events (organization_id);
CREATE INDEX valuation_events_valuation_idx ON valuation_events (valuation_id, id);
