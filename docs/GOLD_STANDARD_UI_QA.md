# Gold Standard UI — QA checklist

Status: automated CI passed on the implementation head before this checklist was added; final CI must pass again on the definitive head containing this file.

## Automated coverage

- [x] TypeScript typecheck.
- [x] Next.js production build, including `/gold-standard`, `/gold-standard/[caseId]` and `/gold-standard/capture/[valuationId]`.
- [x] Existing scoring and Gold Standard unit tests.
- [x] Gold Standard RBAC unit test: only `ADMIN` has `MANAGE_GOLD_STANDARD`; all three organization roles retain `VIEW`.
- [x] PostgreSQL integration suite.
- [x] Anchor persistence integration test: a `DRAFT` case cannot change anchor state; a `VALIDATED` case can.
- [x] Migration-only command.
- [x] Staging Compose validation.
- [x] Hardened Docker runner build and smoke test.

## Manual browser QA — pending

### Navigation and read access

- [ ] Sign in as `ADMIN` and confirm `Gold Standard` appears in the main navigation and `/gold-standard` loads.
- [ ] Sign in as `EVALUATOR` and confirm the workspace and case detail are readable.
- [ ] Sign in as `REVIEWER` and confirm the workspace and case detail are readable.
- [ ] Confirm `EVALUATOR` and `REVIEWER` do **not** see the approved-valuation capture queue or management controls.
- [ ] Attempt Gold Standard write actions with non-admin roles and confirm server-side authorization rejects them.

### Capture workflow

- [ ] With an `APPROVED` valuation not yet captured, confirm it appears in the ADMIN candidate queue.
- [ ] Open the capture form and verify job, valuation version, methodology, points and grade match the source valuation.
- [ ] Confirm `caseCode` and anonymized label are required.
- [ ] Capture with `UNASSIGNED`, `CALIBRATION` and `HOLDOUT` in separate test cases.
- [ ] Capture one case with `isAnchor` enabled.
- [ ] Confirm successful capture redirects to the new Gold Standard case.
- [ ] Confirm the source valuation disappears from the candidate queue after capture.
- [ ] Re-open the capture URL for an already-captured valuation and confirm the UI reports the existing reference instead of offering another capture.

### Reference detail and immutability

- [ ] Confirm case code, anonymized label, partition, anchor flag, points and grade are correct.
- [ ] Confirm job snapshot fields match the historical source values.
- [ ] Confirm the frozen methodology version, expert decisions, justifications and evidence render correctly.
- [ ] Confirm the frozen job description remains unchanged after creating a newer job-description version on the source job.
- [ ] Confirm the source valuation link opens the approved valuation.
- [ ] Confirm no UI control can change methodology snapshot, description snapshot, expert decisions, evidence, points or grade.

### ADMIN benchmark controls

- [ ] Change `UNASSIGNED` → `CALIBRATION` and verify persistence after reload.
- [ ] Change `CALIBRATION` → `HOLDOUT` and verify persistence after reload.
- [ ] Toggle anchor on and off and verify persistence after reload.
- [ ] Confirm partition and anchor changes do not alter expected points, expected grade, decisions or evidence.
- [ ] Confirm security audit events are created for capture, partition changes and anchor changes.

### Responsive / usability

- [ ] Desktop: tables, case detail and forms are usable without horizontal clipping beyond intended table scrolling.
- [ ] Mobile: main navigation remains usable and Gold Standard pages stack correctly.
- [ ] Long descriptives and evidence excerpts remain readable and contained.
- [ ] Empty states are understandable when there are no references or no approved candidates.

## Staging deployment QA — pending

- [ ] Apply migration set through the normal staging deployment path.
- [ ] Repeat the critical ADMIN capture → detail → partition/anchor flow against staging PostgreSQL.
- [ ] Confirm `/api/health` remains healthy and unauthenticated protected routes continue to redirect to sign-in.

Do not mark manual or staging items complete from automated CI alone.
