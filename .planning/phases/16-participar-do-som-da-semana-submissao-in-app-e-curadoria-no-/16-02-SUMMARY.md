---
phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
plan: 02
subsystem: api
tags: [pydantic, model_validator, redis, hash, sorted-set, fastapi, security-gate]

# Dependency graph
requires:
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 01)
    provides: "14 RED security test stubs (SUBMIT-01..09, SEC-SUBMIT-01..05) locking exact model/storage/route contracts"
provides:
  - "Settings: submission_rate_limit_per_hour, submissions_cap, submissions_fallback_path, featured_next_path"
  - "SubmissionArtist/SubmissionLink/SubmissionContact/SubmissionRequest Pydantic models with the codebase's first model_validator"
  - "Submission storage: Hash (submissions:data) + Sorted Set (submissions:index) + dict-keyed JSON fallback, with status-aware cap eviction (_enforce_submissions_cap)"
  - "featured:next helpers (_load_featured_next/_save_featured_next) for Plan 16-04's promote/publish-next flow"
affects: [16-03, 16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "model_validator(mode='after') for cross-field 'at least one of N' validation (SubmissionContact) — first use in the codebase, mirrors field_validator style otherwise"
    - "Distinct tighter-capped public nested models (SubmissionArtist/SubmissionLink) alongside existing admin models (FeaturedArtist/FeaturedLink) — same validator style, different per-field caps to fit the 4KB public body budget"
    - "Hash + Sorted Set + dict-keyed JSON fallback for mutable, status-tracked collections — distinct from the append-only List pattern used by featured:history/updates:history"
    - "Shared _normalize_youtube_url() module-level function extracted from JobRequest.must_be_youtube, reused by SubmissionRequest.youtube_url_required"

key-files:
  created: []
  modified:
    - api/config.py
    - api/main.py

key-decisions:
  - "Extracted JobRequest.must_be_youtube's URL-normalization logic into a module-level _normalize_youtube_url() function so SubmissionRequest.youtube_url could reuse it without depending on pydantic's classmethod/field_validator descriptor internals — behavior is byte-for-byte identical, verified no test references the old method by name"
  - "_enforce_submissions_cap() reads the full submission list via _load_submissions() (newest-first) and evicts the oldest rejeitada/arquivada entries first when count exceeds settings.submissions_cap; pendente/promovida are never eligible regardless of overflow size (soft-overflow if cap is exceeded solely by non-terminal entries)"
  - "_update_submission() re-runs _enforce_submissions_cap() after every status change (e.g. reject/archive in Plan 16-03) since a status transition can make a previously-safe entry newly eligible for eviction"
  - "featured:next uses the exact same load/save/fallback shape as featured:current (single JSON dict, not a list) since it holds at most one pending promoted release"

patterns-established:
  - "Public-facing Pydantic models needing tight body-size budgets get their own nested model classes (SubmissionArtist/SubmissionLink) rather than reusing admin models with looser caps (FeaturedArtist/FeaturedLink) — keeps admin and public caps independently tunable"

requirements-completed: [SUBMIT-02, SUBMIT-03, SUBMIT-09, SEC-SUBMIT-04]

# Metrics
duration: ~20min
completed: 2026-07-22
---

# Phase 16 Plan 02: Data Layer — Models + Storage Summary

**Added SubmissionRequest/SubmissionContact Pydantic models (the codebase's first `model_validator`) with public per-field caps measured to keep the maximum-cardinality payload at 3726 bytes (370-byte margin under the 4KB body limit), plus Hash+SortedSet submission storage with status-aware cap eviction that never touches pendente/promovida entries.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T12:38:00Z
- **Completed:** 2026-07-22T12:48:02Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Added 4 new `Settings` fields (`submission_rate_limit_per_hour`, `submissions_cap`, `submissions_fallback_path`, `featured_next_path`) mirroring the existing `_safe_int`/`os.environ.get` default-factory style.
- Defined `SubmissionArtist`/`SubmissionLink` as distinct public nested models with tighter caps than the admin `FeaturedArtist`/`FeaturedLink` (nome<=100/url<=200, label<=30/url<=220), plus `SubmissionContact` with the project's first `model_validator(mode="after")` enforcing at-least-one-contact (D-08), and `SubmissionRequest` tying it all together with a `website` honeypot decoy field.
- Verified by direct measurement that the true maximum-cardinality submission payload (3 artistas + 1 produtor + 4 links, every string field at its exact cap) serializes to exactly 3726 bytes — 370 bytes under `_MAX_BODY_BYTES=4096` — with no change to the global body-size middleware and no path exception.
- Implemented submission storage on a Hash (`submissions:data`) + Sorted Set (`submissions:index`) with a dict-keyed JSON fallback: `_submission_document`, `_save_submission`, `_get_submission`, `_update_submission`, `_load_submissions`, `_delete_submission`, and `_enforce_submissions_cap` (evicts only oldest `rejeitada`/`arquivada` entries, soft-overflows otherwise).
- Added `featured:next` helpers (`_load_featured_next`/`_save_featured_next`) mirroring the existing `featured:current` load/save/fallback shape, ready for Plan 16-04's promote/publish-next flow.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add submission settings to config.py** - `e94ceb0` (feat)
2. **Task 2: SubmissionContact + SubmissionRequest Pydantic models** - `e0cd39d` (feat)
3. **Task 3: Submission storage (Hash + Sorted Set + fallback + cap eviction)** - `f31f0eb` (feat)

**Plan metadata:** committed separately by the orchestrator after wave merge (STATE.md/ROADMAP.md are not owned by this worktree agent).

## Files Created/Modified
- `api/config.py` - Added `submission_rate_limit_per_hour`, `submissions_cap`, `submissions_fallback_path`, `featured_next_path` settings
- `api/main.py` - Added `_normalize_youtube_url()` (extracted shared helper), `SubmissionArtist`/`SubmissionLink`/`SubmissionContact`/`SubmissionRequest` models, `SUBMISSIONS_DATA_KEY`/`SUBMISSIONS_INDEX_KEY`/`SUBMISSION_TERMINAL_STATUSES`/`FEATURED_NEXT_KEY` constants, and the full submission storage + featured:next helper functions

## Decisions Made
- Refactored `JobRequest.must_be_youtube`'s body into a shared `_normalize_youtube_url()` function rather than calling the pydantic-decorated classmethod directly from `SubmissionRequest`, avoiding any dependency on pydantic v2's `@field_validator`+`@classmethod` descriptor stacking behavior. Confirmed via grep that no test references `must_be_youtube` by name, so this refactor is behavior-preserving.
- Cap eviction (`_enforce_submissions_cap`) is invoked from both `_save_submission` (new inserts) and `_update_submission` (status transitions), since a reject/archive transition can make a previously-protected entry newly eligible for eviction.

## Deviations from Plan

None requiring auto-fix — all three tasks match their `<action>`/`<acceptance_criteria>` blocks exactly. No architectural changes, bug fixes, or missing-functionality additions were needed.

## Issues Encountered

- **Task 3's plan-specified verification command cannot pass at this wave.** The plan's `<verify>` block for Task 3 specifies `pytest tests/test_security.py -k "cap_evicts_terminal" -q` should exit 0, but `test_submissions_cap_evicts_terminal_only` (authored in Plan 16-01's RED baseline) drives the cap-eviction scenario through the full HTTP layer (`POST /submissions`, `GET /yonkou/submissions`, `POST .../reject`) — none of which exist yet, since those routes are explicitly Plan 16-03's scope (`wave: 3, depends_on: ["02"]`, `files_modified: api/main.py` for endpoints). Building those endpoints here would duplicate/conflict with Plan 16-03's own task. This is a pre-existing inconsistency in the plan authoring (the RED stub tests the full stack; Plan 16-02's acceptance criteria optimistically claims it turns GREEN at the storage layer alone), not a defect in this plan's implementation.
  - **Resolution:** Implemented the storage layer exactly as specified in `<action>`/`<behavior>`, and verified all storage-level acceptance criteria (round-trip persistence, cap eviction protecting pendente while evicting oldest rejeitada, featured:next round-trip) via a direct fakeredis-backed unit script exercising `_save_submission`/`_load_submissions`/`_update_submission`/`_enforce_submissions_cap`/`_load_featured_next`/`_save_featured_next` — all passed. The named HTTP-level pytest test remains RED and will turn GREEN once Plan 16-03 adds the `POST /submissions` + `GET /yonkou/submissions` + reject endpoints.
- Confirmed pre-existing, unrelated `test_api.py` failures (10 tests, `redis.exceptions.ConnectionError` to `localhost:6380`) exist identically on the Plan 16-01 baseline commit (before any of this plan's changes) — out of scope per the deviation-rules scope boundary (no local Redis instance available in this execution environment; the `api_client` fixture used by all submission tests uses `fakeredis` instead and is unaffected).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 16-03 (Wave 3) can proceed immediately: `SubmissionRequest`/`SubmissionContact` models and `_save_submission`/`_load_submissions`/`_get_submission`/`_update_submission` storage functions are ready to be wired into `POST /submissions` and the `GET`/`PATCH`/`reject`/`archive` admin endpoints. This will turn `test_post_submission_returns_success`, `test_post_submission_validates_required_fields`, `test_post_submission_requires_one_contact`, `test_submission_rate_limit`, `test_submission_honeypot_silently_dropped`, `test_submission_body_size_enforced`, `test_submission_response_excludes_contact`, `test_get_submissions_requires_admin`, `test_patch_submission_requires_csrf`, `test_reject_and_archive_submission`, `test_submission_admin_mutations_require_csrf`, and `test_submissions_cap_evicts_terminal_only` GREEN.
- Plan 16-04 (Wave 4) can use `_load_featured_next`/`_save_featured_next` directly once Plan 16-03's promote endpoint exists, for `test_promote_submission_writes_featured_next` and `test_publish_next_moves_current_to_history`.
- No blockers identified.

---
*Phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: .planning/phases/16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-/16-02-SUMMARY.md
- FOUND: api/config.py
- FOUND: api/main.py
- FOUND commit e94ceb0 (Task 1: submission settings in config.py)
- FOUND commit e0cd39d (Task 2: SubmissionContact/SubmissionRequest models)
- FOUND commit f31f0eb (Task 3: submission storage Hash+ZSet+fallback+cap eviction)
- FOUND commit 6f58f67 (docs: plan 02 summary)
