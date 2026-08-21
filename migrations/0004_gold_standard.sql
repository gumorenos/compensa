CREATE TABLE gold_standard_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  case_code text NOT NULL CHECK (btrim(case_code) <> ''),
  anonymized_label text NOT NULL CHECK (btrim(anonymized_label) <> ''),
  source_type text NOT NULL CHECK (source_type IN ('APPROVED_VALUATION', 'IMPORT')),
  source_valuation_id uuid,
  methodology_version_id uuid NOT NULL REFERENCES methodology_versions(id) ON DELETE RESTRICT,
  job_description_version_id uuid,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VALIDATED', 'ARCHIVED')),
  partition text NOT NULL DEFAULT 'UNASSIGNED' CHECK (
    partition IN ('UNASSIGNED', 'CALIBRATION', 'HOLDOUT')
  ),
  is_anchor boolean NOT NULL DEFAULT false,
  job_snapshot jsonb NOT NULL CHECK (jsonb_typeof(job_snapshot) = 'object'),
  methodology_snapshot jsonb NOT NULL CHECK (jsonb_typeof(methodology_snapshot) = 'object'),
  description_snapshot text CHECK (
    description_snapshot IS NULL OR btrim(description_snapshot) <> ''
  ),
  expected_total_points numeric(18, 6),
  expected_grade_code text,
  expert_user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  notes text,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, case_code),
  FOREIGN KEY (source_valuation_id, organization_id)
    REFERENCES valuations(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (job_description_version_id, organization_id)
    REFERENCES job_description_versions(id, organization_id) ON DELETE RESTRICT,
  CHECK (
    (source_type = 'APPROVED_VALUATION' AND source_valuation_id IS NOT NULL)
    OR source_type = 'IMPORT'
  ),
  CHECK (
    status = 'DRAFT'
    OR (expected_total_points IS NOT NULL AND expected_grade_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX gold_standard_source_valuation_unique
  ON gold_standard_cases (organization_id, source_valuation_id)
  WHERE source_valuation_id IS NOT NULL;
CREATE INDEX gold_standard_cases_org_partition_idx
  ON gold_standard_cases (organization_id, status, partition, is_anchor);
CREATE INDEX gold_standard_cases_methodology_idx
  ON gold_standard_cases (organization_id, methodology_version_id);

CREATE TABLE gold_standard_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  dimension_code text NOT NULL CHECK (btrim(dimension_code) <> ''),
  selected_level_code text NOT NULL CHECK (btrim(selected_level_code) <> ''),
  justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, case_id, organization_id),
  UNIQUE (case_id, dimension_code),
  FOREIGN KEY (case_id, organization_id)
    REFERENCES gold_standard_cases(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX gold_standard_decisions_case_idx
  ON gold_standard_decisions (organization_id, case_id, dimension_code);

CREATE TABLE gold_standard_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('JOB_DESCRIPTION', 'INTERVIEW', 'OTHER')),
  source_section text,
  excerpt text NOT NULL CHECK (btrim(excerpt) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (case_id, organization_id)
    REFERENCES gold_standard_cases(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (decision_id, case_id, organization_id)
    REFERENCES gold_standard_decisions(id, case_id, organization_id) ON DELETE CASCADE
);

CREATE INDEX gold_standard_evidence_case_idx
  ON gold_standard_evidence (organization_id, case_id, decision_id);
