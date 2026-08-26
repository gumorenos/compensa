CREATE TABLE ai_assistance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  valuation_id uuid NOT NULL,
  methodology_version_id uuid NOT NULL REFERENCES methodology_versions(id) ON DELETE RESTRICT,
  job_description_version_id uuid NOT NULL,
  provider_id text NOT NULL CHECK (btrim(provider_id) <> ''),
  model_id text,
  prompt_version text NOT NULL CHECK (btrim(prompt_version) <> ''),
  input_fingerprint text NOT NULL CHECK (btrim(input_fingerprint) <> ''),
  status text NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  created_by_user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (id, organization_id),
  FOREIGN KEY (valuation_id, organization_id)
    REFERENCES valuations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (job_description_version_id, organization_id)
    REFERENCES job_description_versions(id, organization_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL AND error_code IS NULL AND error_message IS NULL)
    OR
    (status = 'FAILED' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX ai_assistance_runs_valuation_idx
  ON ai_assistance_runs (organization_id, valuation_id, created_at DESC, id DESC);
CREATE INDEX ai_assistance_runs_creator_idx
  ON ai_assistance_runs (created_by_user_id, created_at DESC);

CREATE TABLE ai_factor_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  dimension_code text NOT NULL CHECK (btrim(dimension_code) <> ''),
  suggested_level_code text,
  confidence numeric(5, 4),
  rationale text NOT NULL CHECK (btrim(rationale) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (run_id, dimension_code),
  FOREIGN KEY (run_id, organization_id)
    REFERENCES ai_assistance_runs(id, organization_id) ON DELETE CASCADE,
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX ai_factor_suggestions_run_idx
  ON ai_factor_suggestions (organization_id, run_id, dimension_code);

CREATE TABLE ai_suggestion_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  suggestion_id uuid NOT NULL,
  job_description_version_id uuid NOT NULL,
  source_section text,
  excerpt text NOT NULL CHECK (btrim(excerpt) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (suggestion_id, organization_id)
    REFERENCES ai_factor_suggestions(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (job_description_version_id, organization_id)
    REFERENCES job_description_versions(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX ai_suggestion_evidence_suggestion_idx
  ON ai_suggestion_evidence (organization_id, suggestion_id, id);

CREATE TABLE ai_clarification_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  dimension_code text,
  question_text text NOT NULL CHECK (btrim(question_text) <> ''),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED', 'DISMISSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  FOREIGN KEY (run_id, organization_id)
    REFERENCES ai_assistance_runs(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX ai_clarification_questions_run_idx
  ON ai_clarification_questions (organization_id, run_id, status, id);

-- AI provenance is reference data. Human resolution is stored separately and must never
-- rewrite the model output used to explain or calibrate a recommendation.
CREATE OR REPLACE FUNCTION ai_assistance_protect_run()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AI assistance runs are immutable.';
  END IF;
  RAISE EXCEPTION 'AI assistance runs are immutable.';
END;
$$;

CREATE TRIGGER ai_assistance_runs_immutable
BEFORE UPDATE OR DELETE ON ai_assistance_runs
FOR EACH ROW EXECUTE FUNCTION ai_assistance_protect_run();

CREATE OR REPLACE FUNCTION ai_assistance_protect_suggestion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AI suggestion provenance is immutable.';
  END IF;

  IF ROW(
    NEW.id,
    NEW.organization_id,
    NEW.run_id,
    NEW.dimension_code,
    NEW.suggested_level_code,
    NEW.confidence,
    NEW.rationale,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.organization_id,
    OLD.run_id,
    OLD.dimension_code,
    OLD.suggested_level_code,
    OLD.confidence,
    OLD.rationale,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'AI suggestion provenance is immutable.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_factor_suggestions_provenance_immutable
BEFORE UPDATE OR DELETE ON ai_factor_suggestions
FOR EACH ROW EXECUTE FUNCTION ai_assistance_protect_suggestion();

CREATE OR REPLACE FUNCTION ai_assistance_protect_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AI suggestion evidence is immutable.';
END;
$$;

CREATE TRIGGER ai_suggestion_evidence_immutable
BEFORE UPDATE OR DELETE ON ai_suggestion_evidence
FOR EACH ROW EXECUTE FUNCTION ai_assistance_protect_evidence();

CREATE OR REPLACE FUNCTION ai_assistance_protect_clarification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AI clarification provenance is immutable.';
  END IF;

  IF ROW(
    NEW.id,
    NEW.organization_id,
    NEW.run_id,
    NEW.dimension_code,
    NEW.question_text,
    NEW.reason,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.organization_id,
    OLD.run_id,
    OLD.dimension_code,
    OLD.question_text,
    OLD.reason,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'AI clarification provenance is immutable.';
  END IF;

  IF OLD.status <> 'OPEN' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Resolved AI clarification status is immutable.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_clarification_questions_provenance_immutable
BEFORE UPDATE OR DELETE ON ai_clarification_questions
FOR EACH ROW EXECUTE FUNCTION ai_assistance_protect_clarification();
