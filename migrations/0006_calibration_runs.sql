CREATE TABLE calibration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  partition text NOT NULL CHECK (partition IN ('CALIBRATION', 'HOLDOUT')),
  methodology_version_id uuid NOT NULL REFERENCES methodology_versions(id) ON DELETE RESTRICT,
  candidate_source text NOT NULL DEFAULT 'MANUAL' CHECK (candidate_source IN ('MANUAL', 'EXTERNAL', 'AI')),
  candidate_label text CHECK (candidate_label IS NULL OR btrim(candidate_label) <> ''),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED')),
  summary jsonb,
  created_by_user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  CHECK (summary IS NULL OR jsonb_typeof(summary) = 'object'),
  CHECK (
    (status = 'DRAFT' AND summary IS NULL AND completed_at IS NULL)
    OR (status = 'COMPLETED' AND summary IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX calibration_runs_org_idx
  ON calibration_runs (organization_id, created_at DESC, id);
CREATE INDEX calibration_runs_methodology_partition_idx
  ON calibration_runs (organization_id, methodology_version_id, partition, status);

CREATE TABLE calibration_run_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  case_id uuid NOT NULL,
  case_code_snapshot text NOT NULL CHECK (btrim(case_code_snapshot) <> ''),
  anonymized_label_snapshot text NOT NULL CHECK (btrim(anonymized_label_snapshot) <> ''),
  job_snapshot jsonb NOT NULL CHECK (jsonb_typeof(job_snapshot) = 'object'),
  description_snapshot text,
  methodology_snapshot jsonb NOT NULL CHECK (jsonb_typeof(methodology_snapshot) = 'object'),
  reference_selections jsonb NOT NULL CHECK (jsonb_typeof(reference_selections) = 'object'),
  reference_points numeric(18, 6) NOT NULL,
  reference_grade_code text NOT NULL CHECK (btrim(reference_grade_code) <> ''),
  candidate_selections jsonb,
  candidate_points numeric(18, 6),
  candidate_grade_code text,
  comparison jsonb,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (run_id, case_id),
  FOREIGN KEY (run_id, organization_id)
    REFERENCES calibration_runs(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (case_id, organization_id)
    REFERENCES gold_standard_cases(id, organization_id) ON DELETE RESTRICT,
  CHECK (candidate_selections IS NULL OR jsonb_typeof(candidate_selections) = 'object'),
  CHECK (comparison IS NULL OR jsonb_typeof(comparison) = 'object'),
  CHECK (
    (candidate_selections IS NULL AND candidate_points IS NULL AND candidate_grade_code IS NULL AND comparison IS NULL AND evaluated_at IS NULL)
    OR (candidate_selections IS NOT NULL AND candidate_points IS NOT NULL AND candidate_grade_code IS NOT NULL AND comparison IS NOT NULL AND evaluated_at IS NOT NULL)
  )
);

CREATE INDEX calibration_run_cases_run_idx
  ON calibration_run_cases (organization_id, run_id, case_code_snapshot);

CREATE FUNCTION calibration_enforce_methodology_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM methodology_versions methodology
    WHERE methodology.id = NEW.methodology_version_id
      AND (methodology.organization_id IS NULL OR methodology.organization_id = NEW.organization_id)
  ) THEN
    RAISE EXCEPTION 'Calibration methodology is not available to this organization.'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER calibration_methodology_scope_trigger
BEFORE INSERT OR UPDATE OF organization_id, methodology_version_id
ON calibration_runs
FOR EACH ROW
EXECUTE FUNCTION calibration_enforce_methodology_scope();

CREATE FUNCTION calibration_protect_run()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'COMPLETED' THEN
      RAISE EXCEPTION 'Completed calibration runs cannot be deleted.' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.partition IS DISTINCT FROM OLD.partition
    OR NEW.methodology_version_id IS DISTINCT FROM OLD.methodology_version_id
    OR NEW.candidate_source IS DISTINCT FROM OLD.candidate_source
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
  THEN
    RAISE EXCEPTION 'Calibration run scope is immutable.' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Completed calibration runs are immutable.' USING ERRCODE = '23514';
  END IF;

  IF NEW.status NOT IN ('DRAFT', 'COMPLETED') OR (OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT', 'COMPLETED')) THEN
    RAISE EXCEPTION 'Invalid calibration run lifecycle.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER calibration_run_protection_trigger
BEFORE UPDATE OR DELETE
ON calibration_runs
FOR EACH ROW
EXECUTE FUNCTION calibration_protect_run();

CREATE FUNCTION calibration_protect_run_case()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_run_id uuid;
  target_organization_id uuid;
  parent_status text;
  parent_partition text;
  parent_methodology uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_run_id := OLD.run_id;
    target_organization_id := OLD.organization_id;
  ELSE
    target_run_id := NEW.run_id;
    target_organization_id := NEW.organization_id;
  END IF;

  SELECT status, partition, methodology_version_id
    INTO parent_status, parent_partition, parent_methodology
  FROM calibration_runs
  WHERE id = target_run_id
    AND organization_id = target_organization_id;

  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'Calibration run is unavailable.' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Cases can only be added to draft calibration runs.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM gold_standard_cases gold
      WHERE gold.id = NEW.case_id
        AND gold.organization_id = NEW.organization_id
        AND gold.status = 'VALIDATED'
        AND gold.partition = parent_partition
        AND gold.methodology_version_id = parent_methodology
    ) THEN
      RAISE EXCEPTION 'Calibration case does not match the run scope.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Completed calibration case results are immutable.' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.case_code_snapshot IS DISTINCT FROM OLD.case_code_snapshot
    OR NEW.anonymized_label_snapshot IS DISTINCT FROM OLD.anonymized_label_snapshot
    OR NEW.job_snapshot IS DISTINCT FROM OLD.job_snapshot
    OR NEW.description_snapshot IS DISTINCT FROM OLD.description_snapshot
    OR NEW.methodology_snapshot IS DISTINCT FROM OLD.methodology_snapshot
    OR NEW.reference_selections IS DISTINCT FROM OLD.reference_selections
    OR NEW.reference_points IS DISTINCT FROM OLD.reference_points
    OR NEW.reference_grade_code IS DISTINCT FROM OLD.reference_grade_code
  THEN
    RAISE EXCEPTION 'Calibration reference snapshot is immutable.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER calibration_run_case_protection_trigger
BEFORE INSERT OR UPDATE OR DELETE
ON calibration_run_cases
FOR EACH ROW
EXECUTE FUNCTION calibration_protect_run_case();