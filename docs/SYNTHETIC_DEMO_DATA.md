# Synthetic demo data

Compensa includes an **explicitly synthetic** dataset for staging/demo QA. It is not a migration, is never loaded automatically, and must not be presented as expert or production data.

## Safety

The seed command requires all of the following:

- an existing organization selected by `COMPENSA_ORG_SLUG`;
- an organization slug explicitly marked `staging`, `demo`, `test` or `qa`;
- the active fictional `DEMO_POINT_FACTOR` methodology already provisioned for that organization;
- the exact confirmation `COMPENSA_DEMO_SEED_CONFIRM=SYNTHETIC_STAGING_DATA`.

A production-like slug such as `compensa` or `compensa-prod` is rejected even if the confirmation value is supplied.

The command does not create organizations, users, credentials, or methodologies. It is insert/resume-only for reserved `SYN-DEMO-*` job codes and `SYN-GS-*` Gold Standard case codes. If an existing reserved record no longer matches the expected synthetic definition, the command stops instead of overwriting it.

## Contents

The current fixture creates seven fictional HR positions and one valuation for each. Together they exercise:

- incomplete `DRAFT`;
- complete `DRAFT`;
- `IN_REVIEW`;
- `RETURNED`;
- `APPROVED`;
- deterministic scores/grades;
- three validated Gold Standard references: two `CALIBRATION` cases (one anchor) and one `HOLDOUT` case.

Descriptions use source label `SYNTHETIC_DEMO_V1`. Gold Standard cases use the same value in `notes`. Names and justifications are explicitly labelled as demo/synthetic.

The seed is idempotent when the generated records are unchanged. It intentionally refuses to overwrite manually edited synthetic fixtures; this prevents a QA helper from silently destroying test work.

## Staging invocation

After the normal bootstrap and migrations:

```bash
COMPENSA_DEMO_SEED_CONFIRM=SYNTHETIC_STAGING_DATA \
  docker compose --env-file .env.staging -f compose.staging.yml \
  --profile ops run --rm demo-seed
```

Expected summary:

```text
Synthetic demo ready for <organization>: 7 jobs, 7 valuations, 3 Gold Standard cases.
```

Running the same command again without changing those records must return the same counts and create no duplicates.

## Production

The code rejects organization slugs that are not explicitly marked as staging/demo/test/qa. Do not bypass that boundary or copy synthetic records into a production tenant.
