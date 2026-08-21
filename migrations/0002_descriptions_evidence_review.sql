CREATE TABLE job_description_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content text NOT NULL CHECK (btrim(content) <> ''),
  source_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (job_id, version),
  FOREIGN KEY (job_id, organization_id)
    REFERENCES jobs(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX job_description_versions_org_job_idx
  ON job_description_versions (organization_id, job_id, version DESC);

ALTER TABLE valuations
  ADD COLUMN job_description_version_id uuid,
  ADD CONSTRAINT valuations_description_org_fk
    FOREIGN KEY (job_description_version_id, organization_id)
    REFERENCES job_description_versions(id, organization_id) ON DELETE RESTRICT;

ALTER TABLE valuation_decisions
  ADD CONSTRAINT valuation_decisions_id_valuation_org_unique
  UNIQUE (id, valuation_id, organization_id);

CREATE TABLE valuation_decision_evidence (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  valuation_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('JOB_DESCRIPTION', 'INTERVIEW', 'OTHER')),
  job_description_version_id uuid,
  source_section text,
  excerpt text NOT NULL CHECK (btrim(excerpt) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (valuation_id, organization_id)
    REFERENCES valuations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (decision_id, valuation_id, organization_id)
    REFERENCES valuation_decisions(id, valuation_id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (job_description_version_id, organization_id)
    REFERENCES job_description_versions(id, organization_id) ON DELETE RESTRICT,
  CHECK (
    (source_type = 'JOB_DESCRIPTION' AND job_description_version_id IS NOT NULL)
    OR (source_type <> 'JOB_DESCRIPTION' AND job_description_version_id IS NULL)
  )
);

CREATE INDEX valuation_decision_evidence_valuation_idx
  ON valuation_decision_evidence (organization_id, valuation_id, decision_id);

CREATE TABLE valuation_review_actions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  valuation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('SUBMITTED', 'RETURNED', 'APPROVED')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (valuation_id, organization_id)
    REFERENCES valuations(id, organization_id) ON DELETE CASCADE,
  CHECK (
    action <> 'RETURNED'
    OR (comment IS NOT NULL AND btrim(comment) <> '')
  )
);

CREATE INDEX valuation_review_actions_valuation_idx
  ON valuation_review_actions (organization_id, valuation_id, created_at, id);
