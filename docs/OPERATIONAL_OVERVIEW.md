# Operational overview

`/overview` is the read-only landing view for day-to-day valuation operations. It is intentionally separate from the existing `/` jobs route so the current Puestos URL remains stable.

## Access and boundaries

- Requires general `VIEW` access through the active membership.
- Every query is scoped by the active `organization_id`.
- It does not query Gold Standard, HOLDOUT, calibration reference data or AI data.
- It is descriptive only. No readiness, maturity, quality, outlier or PASS/FAIL score is calculated.

## Metrics

The view exposes:

- active jobs;
- DRAFT, IN_REVIEW, RETURNED and APPROVED valuation counts;
- active jobs that currently have no valuation in `APPROVED` status;
- incomplete editable valuations, defined narrowly as DRAFT or RETURNED valuations with `total_points IS NULL`.

`jobsWithoutApprovedValuation` is a job-level metric. `incompleteEditableValuations` is a valuation-version metric. They must not be merged or presented as equivalent.

Inactive jobs do not contribute to active-job metrics. Their historical valuation versions remain part of valuation history and may therefore appear in recent activity.

## Recent activity

The table shows the latest 8 valuation versions ordered by `valuations.updated_at DESC, id DESC`. It is explicitly labeled as recently updated valuations, not as an audit trail. Audit history remains in the dedicated audit/event records.

Dates are rendered in UTC until organization-level timezone configuration exists.

## Navigation

Authenticated members see `Inicio` pointing to `/overview`; `Puestos` remains `/`. Dashboard cards link to the existing jobs and valuation work-queue routes rather than adding hidden mutation actions.

## Automated coverage

- contract test for `VIEW`, navigation and the no-Gold-Standard/HOLDOUT boundary;
- PostgreSQL integration test for tenant isolation, active/inactive job semantics, approved coverage and incomplete editable valuations;
- PostgreSQL integration test for recent ordering and the fixed 8-row activity cap.

Manual browser/responsive checks remain tracked in `docs/QA_PENDING.md`.
