---
phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
plan: 01
subsystem: testing
tags: [pytest, tdd-red, requirements, pydantic, redis, fastapi, security-gate]

# Dependency graph
requires:
  - phase: 11-som-da-semana-painel-operador
    provides: "_admin_required_dependency/_admin_csrf_dependency, featured:current/history storage pattern, Yonkou panel tab idiom"
provides:
  - "v1.4 REQ-IDs (SUBMIT-01..11, SEC-SUBMIT-01..05) in REQUIREMENTS.md with traceability rows"
  - "14 RED security stubs in tests/test_security.py covering POST /submissions and admin curation endpoints"
  - "7 RED frontend stubs in tests/test_frontend.py covering the participar form contract and Yonkou Submissões tab"
affects: [16-02, 16-03, 16-04, 16-05, 16-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED baseline: every downstream implementation plan turns a named, pre-existing test GREEN"
    - "Submission payload helper (_submission_payload) mirrors _featured_payload style for test fixtures"

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - tests/test_security.py
    - tests/test_frontend.py

key-decisions:
  - "Test names, storage key names (submissions:data/submissions:index/featured:next), and route paths were locked to match the exact contracts already specified in downstream plans 16-02..16-06 (read ahead during Task 2/3 authoring) so stubs require zero renaming later"
  - "test_submission_body_size_enforced passes even in the RED baseline because the existing global _limit_body_size middleware (4KB) already rejects oversized bodies at any path — this is expected and does not indicate the endpoint exists"

patterns-established:
  - "Public-write endpoint RED stubs assert the intended final behavior (202/422/429), not the current 404, so failures self-document as 'endpoint pending' rather than being tautological"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-07-22
---

# Phase 16 Plan 01: Wave 0 TDD RED Baseline Summary

**Defined 16 new v1.4 REQ-IDs and authored 21 failing (RED) test stubs — 14 security + 7 frontend — establishing the automated-test contract every later Phase 16 plan must turn GREEN.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-22T~12:00Z
- **Completed:** 2026-07-22T12:35:31Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added `## v1.4 Requirements — Participar do Som da Semana` section to REQUIREMENTS.md defining SUBMIT-01..11 (functional) and SEC-SUBMIT-01..05 (security), each tracing to a CONTEXT.md decision (D-01..D-12), plus 16 new traceability rows (Phase 16, Pending).
- Added 14 named RED security stubs to `tests/test_security.py` covering the public `POST /submissions` intake (success, validation, rate limit, honeypot, body size, contact exclusion) and every admin curation endpoint (list, edit, promote, publish-next, reject, archive, CSRF gates, cap eviction).
- Added 7 named RED frontend contract stubs to `tests/test_frontend.py` covering the table-based Y2K form, required `youtube_url`, contact section, privacy note, off-canvas honeypot, removal of the email/copy-template flow, and the Yonkou "Submissões" tab.
- Verified both suites collect cleanly (82 tests total, 0 collection errors) and that all 20 new tests fail as expected (RED) with zero regressions in the 62 pre-existing tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define v1.4 REQ-IDs in REQUIREMENTS.md** - `ca3d714` (docs)
2. **Task 2: RED security stubs for submissions + curation** - `e478903` (test)
3. **Task 3: RED frontend contract stubs for form + admin tab** - `227c3fa` (test)

**Plan metadata:** committed separately by the worktree orchestrator after wave merge (STATE.md/ROADMAP.md are not owned by this worktree agent).

## Files Created/Modified
- `.planning/REQUIREMENTS.md` - Added v1.4 section (16 REQ-IDs) + 16 traceability rows + updated footer date/note
- `tests/test_security.py` - Added `_submission_payload()` helper + 14 RED tests (SUBMIT-01..09, SEC-SUBMIT-01..05)
- `tests/test_frontend.py` - Added 7 RED tests (participar form contract + Yonkou Submissões tab)

## Decisions Made
- Read ahead into plans 16-02 through 16-06 (already authored by the planner) to lock exact test names, route paths (`POST /submissions`, `GET/PATCH /yonkou/submissions/{id}`, `POST /yonkou/submissions/{id}/promote|reject|archive`, `POST /yonkou/releases/publish-next`), and Redis key names (`submissions:data`, `submissions:index`, `featured:next`) into the RED stubs now, so no stub needs renaming when later plans implement it.
- Payload caps in `_submission_payload()` (titulo/genero, descricao, contact fields) mirror the tightened public caps locked in Plan 16-02's `must_haves` (artistas<=3, produtores<=1, links<=4, contact<=150 chars each) so the fixture stays valid once `SubmissionRequest` exists.
- Honeypot field is named `website` in both the payload fixture and the frontend markup assertions (not `honeypot`), per Pitfall 3 and Plan 16-02's explicit field name — this was cross-checked against 16-05's interfaces section before writing the frontend stub.

## Deviations from Plan

None — plan executed exactly as written. All three tasks match their `<action>`/`<acceptance_criteria>` blocks; no architectural changes, bug fixes, or missing-functionality additions were needed since this plan only adds test stubs and a requirements document section (no production code).

## Issues Encountered
- No local Redis instance was running on port 6380 (the dev fixture port) in this environment, and no project `.venv` exists inside the git worktree (worktrees don't carry unversioned dirs). Resolved by running pytest with the main repo's `.venv/bin/python` interpreter against the worktree's `tests/` path directly — the `api_client` fixture uses `fakeredis` so no real Redis was needed for verification.
- The plan's own Task 3 verification command (`pytest -k "participar or submissoes"`) does not match `test_yonkou_has_submissions_tab` by substring (the test name uses "submissions", not "submissoes"), so that command only exercises 6 of the 7 new frontend stubs. This is a pre-existing minor inconsistency in the plan's `-k` filter wording, not a stub defect — the 7th test name matches the exact filter (`-k "yonkou_has_submissions_tab"`) used later by Plan 16-06's own acceptance criteria, and was independently verified RED in isolation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 16-02 (Wave 2) can proceed immediately: `SubmissionRequest`/`SubmissionContact` models and Hash+SortedSet storage will turn `test_post_submission_validates_required_fields`, `test_post_submission_requires_one_contact`, and `test_submissions_cap_evicts_terminal_only` GREEN (plus contribute to the body-size stub).
- Plan 16-03 (Wave 3) depends on 16-02's models/storage and will turn the remaining public-endpoint and admin list/edit/reject/archive stubs GREEN.
- Plan 16-04 (Wave 4) depends on 16-03 and will turn the promote/publish-next stubs GREEN.
- Plans 16-05/16-06 (frontend) can proceed in the same wave as 16-04 since the frontend stubs only depend on markup/JS, not on the backend endpoints being live (though full end-to-end human verification in 16-06 requires the backend chain complete).
- No blockers identified.

---
*Phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-*
*Completed: 2026-07-22*
