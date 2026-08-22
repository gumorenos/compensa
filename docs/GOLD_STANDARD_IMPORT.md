# Gold Standard historical bulk import

This import is for expert cases that predate Compensa. It does **not** require recreating them first as Compensa valuations.

## Contract

Version 1 accepts JSON with one or more anonymized historical cases:

```json
{
  "version": 1,
  "cases": [
    {
      "caseCode": "GS-001",
      "anonymizedLabel": "Jefatura financiera — referencia 01",
      "methodologyVersionId": "uuid-of-existing-methodology-version",
      "job": {
        "code": "FIN-001",
        "name": "Jefatura financiera",
        "department": "Finanzas",
        "area": "Planeamiento",
        "jobFamily": "Finanzas"
      },
      "description": "Descriptivo anonimizado utilizado por el experto.",
      "decisions": [
        {
          "dimensionCode": "AUTONOMY",
          "selectedLevelCode": "A2",
          "justification": "Decide dentro de políticas definidas.",
          "evidence": [
            {
              "sourceType": "JOB_DESCRIPTION",
              "sourceSection": "Responsabilidades",
              "excerpt": "Puede aprobar ajustes operativos dentro de políticas definidas."
            }
          ]
        }
      ],
      "expectedTotalPoints": 231,
      "expectedGradeCode": "G3",
      "partition": "CALIBRATION",
      "isAnchor": true,
      "expertUserId": null,
      "notes": "Contexto de calibración sin datos personales."
    }
  ]
}
```

All dimensions required by the referenced methodology must be represented in `decisions`. `expectedTotalPoints` and `expectedGradeCode` are optional, but if one is supplied the other is mandatory. When present they are treated as a consistency check against the deterministic recalculation; Compensa never accepts them as authoritative without reproducing them.

`partition` defaults to `UNASSIGNED`; accepted values are `UNASSIGNED`, `CALIBRATION` and `HOLDOUT`. `isAnchor` defaults to false. Evidence source types are `JOB_DESCRIPTION`, `INTERVIEW` and `OTHER`.

For import version 1, `expertUserId` must be omitted or `null`. This intentionally prevents a historical file from binding an expert identity to an arbitrary Compensa user or to a user from another tenant. The user performing the future authenticated import operation can be stored separately as `createdByUserId`. Explicit expert attribution, if needed, should be implemented later as a membership-aware operation that confirms an ACTIVE membership in the same organization.

## Safety properties

- The methodology version must already exist and be available to the target organization.
- The methodology definition is copied into the case snapshot at import time.
- The anonymized job and descriptive text are stored as historical snapshots; no live Job record is required.
- Dimension/level selections are recalculated with the deterministic scoring engine.
- Missing dimensions, invalid level codes or invalid methodology configuration reject the case.
- When historical points/grade are supplied, both must match the deterministic result exactly.
- Decisions, justifications and evidence are copied before the case transitions from `DRAFT` to `VALIDATED`.
- Duplicate case codes inside the JSON are rejected before any write.
- Case-code advisory locks are acquired in sorted order to serialize overlapping concurrent batches without introducing lock-order deadlocks.
- The complete batch is one PostgreSQL transaction: if any later case fails, every new case in that batch rolls back.
- Direct expert-user attribution is rejected by the v1 parser.
- Existing validated Gold Standard immutability protections remain unchanged.
- No AI/model call participates in parsing, scoring, validation or import.

## Recommended initial dataset

Start with roughly 15–30 anonymized expert cases spanning levels, functions and both individual-contributor and people-management roles. Preserve a genuinely unseen holdout for later model evaluation. A practical starting point is around 70–80% `CALIBRATION` and 20–30% `HOLDOUT`, but representation of important job families and anchor roles matters more than a mechanically random split.

Do not place personal names, employee performance information, compensation amounts or other unnecessary personal data in the job snapshot, descriptive text, evidence or notes.

## Automated QA

The final branch must pass the complete CI gate before merge: strict TypeScript, Next.js production build, all unit and PostgreSQL integration tests, migration-only command, staging Compose validation, hardened Docker runner build and staging smoke test.

Coverage includes historical parsing/normalization, unsupported and empty documents, duplicate case codes, duplicate dimensions, invalid partitions/anchors/evidence types, rejection of direct expert attribution, paired expected points/grade validation, successful multi-case import, snapshot/decision/evidence persistence, creator versus expert separation, whole-batch rollback on cross-tenant methodology, whole-batch rollback on historical score/grade mismatch and rejection of invalid expert level selections.
