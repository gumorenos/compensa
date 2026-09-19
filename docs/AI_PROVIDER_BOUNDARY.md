# External AI provider boundary

This document describes the configuration boundary that must exist before Compensa can add a real external AI adapter.

## Current behavior

- The deterministic local fixture remains the only implemented assistance provider.
- External provider metadata can be declared by deployment configuration, but no external adapter exists and no network call can be made from that metadata.
- Tenant governance remains independent: `assistanceEnabled` and `externalProcessingAllowed` are stored per organization.
- A deployment-level provider configuration never overrides tenant consent.

## Non-secret metadata

A future adapter may consume the following validated metadata:

- `COMPENSA_AI_EXTERNAL_PROVIDER_ID`
- `COMPENSA_AI_EXTERNAL_SERVICE_ID`
- `COMPENSA_AI_EXTERNAL_MODEL_ID`
- `COMPENSA_AI_EXTERNAL_ALLOWED_PROVIDERS`

The allowlist is default-deny. An external provider ID that is not explicitly allowlisted is invalid.

## Secret references

`COMPENSA_AI_EXTERNAL_SECRET_REF` is metadata, not a credential. The only accepted shape in this increment is `env:VARIABLE_NAME`.

The configuration parser:

- never reads the referenced environment variable;
- never returns the secret reference name;
- never returns a credential value;
- exposes only whether a syntactically valid reference was configured.

A future adapter must introduce a dedicated secret resolver. That resolver must not write credentials to PostgreSQL, Git, application logs, audit payloads, browser output or exception text.

## Why there is no migration

Provider configuration is not yet a tenant-editable product feature and no external adapter has been selected. Persisting speculative provider/service/model/secret fields now would create schema and migration debt before the secret lifecycle and provider policy are settled.

If Compensa later supports different external providers per tenant, PostgreSQL may store non-secret binding metadata and an opaque secret reference only. The credential itself must remain in the selected secret-management system.

## Gate before a real adapter

Before an external adapter can be bound, the implementation must define and test:

1. provider privacy, retention, training and residency policy;
2. secret resolution, rotation and deletion;
3. exact provider/service/model traceability;
4. prompt versioning;
5. request redaction and logging policy;
6. timeouts, retries/backoff and idempotency;
7. tenant/user quotas, rate limits and cost controls;
8. prompt-injection treatment for job-description content;
9. failure behavior that leaves the manual workflow available;
10. hard exclusion of Gold Standard, HOLDOUT and calibration data;
11. explicit human ACCEPT/MODIFY/REJECT authority;
12. a connection test that cannot leak credentials.

No provider SDK should be added before those gates are implemented for the selected adapter.
