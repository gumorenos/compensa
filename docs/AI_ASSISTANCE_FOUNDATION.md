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

These records never overwrite `valuation_decisions`.

Human resolution is persisted separately in `ai_suggestion_resolutions`. Each suggestion may be resolved exactly once as `ACCEPTED`, `MODIFIED` or `REJECTED`, and that resolution record is immutable. The original suggestion, rationale, confidence and evidence remain unchanged.

- `ACCEPTED` uses the exact level persisted in the AI suggestion and writes the human valuation decision with source `AI_ACCEPTED`.
- `MODIFIED` requires an explicit human level and writes the valuation decision with source `AI_MODIFIED`. If the model made a concrete suggestion, the modified level must actually differ. A model abstention (`null`) may be modified into an explicit human level.
- `REJECTED` writes no valuation decision and does not change points or grade.

Acceptance/modification reuse the existing deterministic `ValuationService` and scoring engine. The resolution row, valuation decision/recalculation, valuation event and security audit event commit atomically. A caller-supplied human justification is allowed for acceptance/modification, but Compensa never copies the AI rationale into a human justification automatically.

The database also enforces the provenance semantics for direct SQL writes: an accepted resolution cannot name a level different from the original suggestion, a concrete suggestion cannot be labeled modified without changing level, and resolution rows cannot be updated or deleted.

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

Human resolution uses the same `valuation-edit:<valuationId>` advisory-lock order as ordinary manual decision editing. Competing manual edits and AI resolutions for one valuation are serialized, and exactly one immutable resolution can exist for a suggestion. Resolution is allowed only while the valuation is `DRAFT` or `RETURNED` and only while the valuation still references the methodology and job-description versions used by the AI run.

## Access boundary

There is still no HTTP route or Server Action for AI generation or resolution in this increment. When a UI/provider binding is added, both generation and human resolution must require the existing `EVALUATE` permission: ADMIN and EVALUATOR may request/resolve assistance; REVIEWER remains read-only and cannot initiate or resolve it.

The application service receives the authenticated human actor ID so the eventual `AI_SUGGESTION_RESOLVED` valuation/security audit records can attribute the decision without placing rationale, evidence, notes or justification text in the security audit payload.

## Privacy and provider binding

No provider SDK, API key, model environment variable or prompt containing customer data is introduced here. Before enabling a real provider, a later provider-binding increment must make an explicit decision on:

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

The provider-neutral generation boundary and the audited human resolution lifecycle are now defined without exposing a provider or UI. The next safe increment should bind the **application-facing assistance workflow** without weakening those boundaries: organization-level opt-in/configuration, an `EVALUATE`-protected read/generate/resolve surface, and a provider adapter behind the existing interface.

Provider selection must not be treated as a simple SDK wiring task. Before real customer text leaves Compensa, the privacy/retention, secrets, logging/redaction, quotas, timeout/retry and consent items in `docs/QA_PENDING.md` must be decided. A deterministic fake/fixture provider may be used first to exercise the complete UI and human-resolution flow without external data transfer.
