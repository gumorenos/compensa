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

CREATE FUNCTION gold_standard_enforce_methodology_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM methodology_versions methodology
    WHERE methodology.id = NEW.methodology_version_id
      AND (
        methodology.organization_id IS NULL
        OR methodology.organization_id = NEW.organization_id
      )
  ) THEN
    RAISE EXCEPTION 'Gold Standard methodology is not available to this organization.'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gold_standard_methodology_scope_trigger
BEFORE INSERT OR UPDATE OF organization_id, methodology_version_id
ON gold_standard_cases
FOR EACH ROW
EXECUTE FUNCTION gold_standard_enforce_methodology_scope();

CREATE FUNCTION gold_standard_protect_validated_case()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.case_code IS DISTINCT FROM OLD.case_code
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_valuation_id IS DISTINCT FROM OLD.source_valuation_id
    OR NEW.methodology_version_id IS DISTINCT FROM OLD.methodology_version_id
    OR NEW.job_description_version_id IS DISTINCT FROM OLD.job_description_version_id
    OR NEW.job_snapshot IS DISTINCT FROM OLD.job_snapshot
    OR NEW.methodology_snapshot IS DISTINCT FROM OLD.methodology_snapshot
    OR NEW.description_snapshot IS DISTINCT FROM OLD.description_snapshot
    OR NEW.expected_total_points IS DISTINCT FROM OLD.expected_total_points
    OR NEW.expected_grade_code IS DISTINCT FROM OLD.expected_grade_code
    OR NEW.expert_user_id IS DISTINCT FROM OLD.expert_user_id
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.validated_at IS DISTINCT FROM OLD.validated_at
  ) THEN
    RAISE EXCEPTION 'Validated Gold Standard reference fields are immutable.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'Archived Gold Standard cases cannot be reactivated.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER gold_standard_case_immutability_trigger
BEFORE UPDATE
ON gold_standard_cases
FOR EACH ROW
EXECUTE FUNCTION gold_standard_protect_validated_case();

CREATE FUNCTION gold_standard_protect_case_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Validated or archived Gold Standard cases cannot be deleted.'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER gold_standard_case_delete_trigger
BEFORE DELETE
ON gold_standard_cases
FOR EACH ROW
EXECUTE FUNCTION gold_standard_protect_case_delete();

CREATE FUNCTION gold_standard_require_draft_parent(
  target_case_id uuid,
  target_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_status text;
BEGIN
  SELECT status
    INTO target_status
  FROM gold_standard_cases
  WHERE id = target_case_id
    AND organization_id = target_organization_id;

  IF target_status IS NOT NULL AND target_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Validated Gold Standard decisions and evidence are immutable.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION gold_standard_protect_reference_detail()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM gold_standard_require_draft_parent(NEW.case_id, NEW.organization_id);
    RETURN NEW;
  END IF;

  PERFORM gold_standard_require_draft_parent(OLD.case_id, OLD.organization_id);

  IF TG_OP = 'UPDATE' THEN
    PERFORM gold_standard_require_draft_parent(NEW.case_id, NEW.organization_id);
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER gold_standard_decision_immutability_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON gold_standard_decisions
FOR EACH ROW
EXECUTE FUNCTION gold_standard_protect_reference_detail();

CREATE TRIGGER gold_standard_evidence_immutability_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON gold_standard_evidence
FOR EACH ROW
EXECUTE FUNCTION gold_standard_protect_reference_detail();
