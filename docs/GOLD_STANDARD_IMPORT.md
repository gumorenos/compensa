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

`expertUserId` should only be supplied when the historical expert is explicitly known **and** represented by an existing Compensa user. The user performing the import is stored separately as `createdByUserId`; importing a case never implies that the importer was the expert evaluator.

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
- Existing validated Gold Standard immutability protections remain unchanged.
- No AI/model call participates in parsing, scoring, validation or import.

## Recommended initial dataset

Start with roughly 15–30 anonymized expert cases spanning levels, functions and both individual-contributor and people-management roles. Preserve a genuinely unseen holdout for later model evaluation. A practical starting point is around 70–80% `CALIBRATION` and 20–30% `HOLDOUT`, but representation of important job families and anchor roles matters more than a mechanically random split.

Do not place personal names, employee performance information, compensation amounts or other unnecessary personal data in the job snapshot, descriptive text, evidence or notes.

## Automated QA

Verified in CI on the implementation head before merge:

- TypeScript strict typecheck: PASS;
- Next.js production build: PASS;
- unit tests: 21/21 PASS across 4 files;
- PostgreSQL integration tests: 33/33 PASS across 8 files;
- migration-only command: PASS, 4 migrations;
- staging Compose validation: PASS;
- hardened Docker runner build: PASS;
- staging container smoke test: PASS;
- npm audit during install/build: 0 vulnerabilities detected.

Coverage includes valid historical parsing/normalization, unsupported and empty documents, duplicate case codes, duplicate dimensions, invalid partitions/anchors/evidence types, paired expected points/grade validation, successful multi-case import, snapshot/decision/evidence persistence, creator versus expert attribution, whole-batch rollback on cross-tenant methodology, whole-batch rollback on historical score/grade mismatch and rejection of invalid expert level selections.
