# AI assistance foundation

Stage 3 starts with a provider-neutral assistance boundary. This increment does **not** connect Compensa to an external model and does not expose an AI button in the UI yet.

## Product boundary

The deterministic valuation remains authoritative. AI may propose:

- a level code for a methodology dimension, or explicitly abstain with `null`;
- a rationale;
- evidence excerpts anchored in the job description version pinned to the valuation;
- clarification questions when the available evidence is insufficient.

AI does not receive or produce scoring steps, total points, grade ranges, grade recommendations, workflow status changes or final decisions. Provider payloads containing unsupported fields such as points or grades are rejected rather than ignored.

## Human decision remains separate

AI output is persisted in dedicated tables:

- `ai_assistance_runs`;
- `ai_factor_suggestions`;
- `ai_suggestion_evidence`;
- `ai_clarification_questions`.

These records never overwrite `valuation_decisions`. A later human action may use the existing decision sources `AI_ACCEPTED` or `AI_MODIFIED`, while the original suggestion remains available for audit and calibration of the assistant itself.

## Provider contract

`AIAssistanceProvider` is injected into `AIAssistanceService`. The provider receives only:

- valuation ID;
- the pinned job-description version and its content;
- methodology code/name/version;
- factors, dimensions and allowed levels.

The provider context deliberately excludes `methodology.scoring` and `methodology.grades`.

The provider returns `unknown`; Compensa validates the payload at runtime before any persistence. Validation rejects:

- unknown fields;
- duplicate suggestion dimensions;
- dimensions outside the pinned methodology;
- level codes outside the referenced dimension;
- confidence values outside `[0,1]` or non-finite values;
- invented job-description evidence;
- empty results.

Partial suggestions and explicit abstention are valid. Missing evidence is not fabricated.

## Evidence boundary

For Stage 3 foundation, AI evidence is restricted to the pinned job description. Excerpts are normalized for whitespace/case and must be contained in that exact description version. Interview or external evidence is not accepted from the provider in this increment.

## Transaction and race safety

The external/provider call is deliberately made outside the PostgreSQL transaction. Before persistence, Compensa locks the valuation row and revalidates that:

- the valuation still belongs to the same organization;
- it remains `DRAFT` or `RETURNED`;
- the methodology version is unchanged;
- the pinned job-description version is unchanged.

If any of these conditions change while analysis is running, the provider result is discarded. A completed run, all suggestions/evidence/questions and the `AI_ASSISTANCE_RECORDED` security audit event are then persisted atomically.

Generation itself never calls the scoring engine, writes `valuation_decisions`, changes `total_points`, changes `grade_code` or changes valuation status.

## Access boundary

There is no HTTP route or Server Action for generation in this increment. When a UI/provider binding is added, invocation must require the existing `EVALUATE` permission: ADMIN and EVALUATOR may request assistance; REVIEWER remains read-only and cannot initiate it.

## Privacy and provider binding

No provider SDK, API key, model environment variable or prompt containing customer data is introduced here. Before enabling a real provider, the next increment must make an explicit decision on:

- provider and model;
- data retention and training policy;
- regional processing / data residency where relevant;
- secrets management;
- request logging and redaction;
- rate/cost limits;
- timeout/retry policy;
- prompt versioning and model-version traceability;
- whether customer configuration permits sending job descriptions externally.

The current schema stores provider/model identifiers and an input fingerprint, but the security audit payload intentionally excludes raw job-description text and evidence excerpts.

## Next increment

The next safe step is provider configuration plus a read-only suggestion panel behind `EVALUATE`, using a deterministic/mock provider in tests. Acceptance/modification should remain an explicit human action that writes the valuation decision separately and triggers the existing deterministic scoring flow.
