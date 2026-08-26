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
