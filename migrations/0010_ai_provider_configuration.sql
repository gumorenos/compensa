CREATE TABLE ai_provider_configurations (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id text NOT NULL
    CHECK (length(trim(provider_id)) BETWEEN 1 AND 80),
  model_id text NOT NULL
    CHECK (length(trim(model_id)) BETWEEN 1 AND 240),
  credential_reference text NOT NULL
    CHECK (credential_reference ~ '^COMPENSA_AI_CREDENTIAL_[A-Z0-9_]{1,80}$'),
  updated_by_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_provider_configurations_updated_by_idx
  ON ai_provider_configurations (updated_by_user_id, updated_at DESC);
