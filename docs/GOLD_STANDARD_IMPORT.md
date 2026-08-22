# Gold Standard bulk import

Historical expert cases can be promoted in batches without weakening the same validation used by the UI capture flow.

## Contract

The import accepts JSON only. Version 1 has this shape:

```json
{
  "version": 1,
  "cases": [
    {
      "valuationId": "uuid-of-approved-valuation",
      "caseCode": "GS-001",
      "anonymizedLabel": "Caso referencia 001",
      "partition": "CALIBRATION",
      "isAnchor": true,
      "expertUserId": null,
      "notes": "Optional operational metadata"
    }
  ]
}
```

`partition` is optional and defaults to `UNASSIGNED`. Accepted values are `UNASSIGNED`, `CALIBRATION` and `HOLDOUT`. `isAnchor` defaults to false. `expertUserId` must only be supplied when the expert identity is explicitly known; the importing ADMIN is recorded separately as creator by the caller.

## Safety properties

- Every source valuation must already be `APPROVED` in the same organization.
- Every source must reference an available methodology and, when applicable, job-description version.
- Decisions are recalculated with the deterministic scoring engine.
- Stored points and grade must exactly reproduce from the frozen methodology and decisions.
- Decisions and evidence are copied into the Gold Standard snapshot.
- Duplicate case codes and duplicate valuation IDs inside the document are rejected before writes.
- Already captured source valuations are rejected.
- The complete batch is atomic: if any case fails validation, no case from that batch is committed.
- No AI/model call participates in import or validation.

## Recommended historical load

Start with 15–30 expert-approved valuations. Keep the initial holdout genuinely unseen by later prompt/model calibration. A practical starting split is roughly 70–80% `CALIBRATION` and 20–30% `HOLDOUT`, while ensuring anchors and important job families are represented deliberately rather than randomly.

## QA still required

Before using this against production data, exercise the service with PostgreSQL integration tests covering: successful multi-case import; rollback when the second case fails; cross-organization source rejection; already-captured source; duplicate case code; duplicate valuation ID; non-approved valuation; non-reproducible scoring; score/grade mismatch; partition/anchor persistence; creator versus expert attribution.
