CREATE OR REPLACE FUNCTION methodology_versions_protect_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Active or retired methodology versions cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('ACTIVE', 'RETIRED') THEN
    IF ROW(
      OLD.organization_id,
      OLD.code,
      OLD.name,
      OLD.version,
      OLD.definition,
      OLD.content_owner
    ) IS DISTINCT FROM ROW(
      NEW.organization_id,
      NEW.code,
      NEW.name,
      NEW.version,
      NEW.definition,
      NEW.content_owner
    ) THEN
      RAISE EXCEPTION 'Published methodology version content is immutable; create a new version instead.';
    END IF;

    IF OLD.status = 'RETIRED' AND NEW.status <> 'RETIRED' THEN
      RAISE EXCEPTION 'Retired methodology versions cannot be reactivated.';
    END IF;

    IF OLD.status = 'ACTIVE' AND NEW.status NOT IN ('ACTIVE', 'RETIRED') THEN
      RAISE EXCEPTION 'Active methodology versions may only remain active or be retired.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS methodology_versions_immutable_trigger ON methodology_versions;
CREATE TRIGGER methodology_versions_immutable_trigger
BEFORE UPDATE OR DELETE ON methodology_versions
FOR EACH ROW
EXECUTE FUNCTION methodology_versions_protect_immutable();
