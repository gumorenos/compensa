CREATE TABLE ai_assistance_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  assistance_enabled boolean NOT NULL DEFAULT false,
  external_processing_allowed boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT external_processing_allowed OR assistance_enabled)
);

CREATE INDEX ai_assistance_settings_updated_by_idx
  ON ai_assistance_settings (updated_by_user_id, updated_at DESC);
