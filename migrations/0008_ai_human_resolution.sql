CREATE TABLE ai_suggestion_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  suggestion_id uuid NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('ACCEPTED', 'MODIFIED', 'REJECTED')),
  resolved_level_code text,
  note text,
  resolved_by_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (suggestion_id),
  FOREIGN KEY (suggestion_id, organization_id)
    REFERENCES ai_factor_suggestions(id, organization_id) ON DELETE RESTRICT,
  CHECK (note IS NULL OR char_length(note) <= 2000),
  CHECK (
    (resolution IN ('ACCEPTED', 'MODIFIED')
      AND resolved_level_code IS NOT NULL
      AND btrim(resolved_level_code) <> '')
    OR
    (resolution = 'REJECTED' AND resolved_level_code IS NULL)
  )
);

CREATE INDEX ai_suggestion_resolutions_org_idx
  ON ai_suggestion_resolutions (organization_id, resolution, created_at DESC, id DESC);
CREATE INDEX ai_suggestion_resolutions_actor_idx
  ON ai_suggestion_resolutions (resolved_by_user_id, created_at DESC);

-- Keep resolution labels honest even for direct SQL writes. ACCEPTED must preserve
-- the model suggestion exactly; MODIFIED must actually differ when the model made
-- a concrete suggestion. A null model suggestion may be MODIFIED into a human level.
CREATE OR REPLACE FUNCTION ai_suggestion_resolution_validate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  suggested_level text;
BEGIN
  SELECT suggested_level_code
    INTO suggested_level
    FROM ai_factor_suggestions
   WHERE id = NEW.suggestion_id
     AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI suggestion does not exist in this organization.';
  END IF;

  IF NEW.resolution = 'ACCEPTED' THEN
    IF suggested_level IS NULL THEN
      RAISE EXCEPTION 'An abstaining AI suggestion cannot be accepted.';
    END IF;
    IF NEW.resolved_level_code IS DISTINCT FROM suggested_level THEN
      RAISE EXCEPTION 'Accepted AI resolution must use the suggested level.';
    END IF;
  ELSIF NEW.resolution = 'MODIFIED' THEN
    IF suggested_level IS NOT NULL AND NEW.resolved_level_code = suggested_level THEN
      RAISE EXCEPTION 'Modified AI resolution must differ from the suggested level.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_suggestion_resolutions_validate
BEFORE INSERT ON ai_suggestion_resolutions
FOR EACH ROW EXECUTE FUNCTION ai_suggestion_resolution_validate();

CREATE OR REPLACE FUNCTION ai_suggestion_resolution_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AI suggestion resolutions are immutable.';
END;
$$;

CREATE TRIGGER ai_suggestion_resolutions_immutable
BEFORE UPDATE OR DELETE ON ai_suggestion_resolutions
FOR EACH ROW EXECUTE FUNCTION ai_suggestion_resolution_immutable();
