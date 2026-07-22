---
phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
plan: 04
subsystem: api
tags: [fastapi, pydantic, redis, csrf, curation, state-machine]

# Dependency graph
requires:
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 02)
    provides: "_load_featured_next/_save_featured_next (featured:next storage), _get_submission/_update_submission (submission storage)"
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 03)
    provides: "Admin submission CRUD pattern (GET/PATCH/reject/archive), JOB_ID_PATTERN IDOR-defense convention"
provides:
  - "_promote_submission(submission) — derives a FeaturedReleaseRequest-shaped doc from a submission's content fields"
  - "POST /yonkou/submissions/{id}/promote — stages featured:next, marks submission 'promovida', never touches featured:current (D-06/D-07)"
  - "POST /yonkou/releases/publish-next — moves featured:next -> featured:current, retires old current to featured:history, clears featured:next"
  - "_clear_featured_next() — DELETE-based clear (not SET with empty dict) so featured:next reads back None after publish"
affects: [16-05, 16-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step promote/publish: promote writes only the staging slot (featured:next); a separate explicit CSRF-gated action performs the actual cutover — never collapse into one endpoint (D-06 locked anti-pattern)"
    - "Clearing a Redis-backed optional slot must use DELETE, not SET with a falsy payload — the read helper's contract (empty dict treated as None) doesn't automatically make a raw redis GET return None unless the key itself is removed"

key-files:
  created: []
  modified:
    - api/main.py
    - .planning/SECURITY-CHECKLIST.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Promote re-derives featured:next idempotently on every call (locked task-level decision inherited from 16-RESEARCH.md Open Question #1) — editing a submission never auto-refreshes an already-staged featured:next; the operator must re-promote after editing, before publishing"
  - "_clear_featured_next deletes the Redis key and removes the fallback file, rather than writing an empty dict via _save_featured_next, because the test suite asserts _redis.get('featured:next') is None after publish — a SET with '{}' would leave a truthy string in Redis"

requirements-completed: [SUBMIT-06, SUBMIT-07, SEC-SUBMIT-03]

# Metrics
duration: ~20min
completed: 2026-07-22
---

# Phase 16 Plan 04: Two-Step Promote + Publish-Next Endpoints Summary

**Added `POST /yonkou/submissions/{id}/promote` (stages a derived release in `featured:next`) and `POST /yonkou/releases/publish-next` (cuts `featured:next` over to `featured:current`, retiring the old current to `featured:history`), turning the last 3 RED security stubs from Plan 16-03 GREEN with zero regressions in the other 53 security tests.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T~09:55Z
- **Completed:** 2026-07-22T~10:06Z
- **Tasks:** 2
- **Files modified:** 2 (api/main.py, .planning/SECURITY-CHECKLIST.md) + REQUIREMENTS.md metadata

## Accomplishments
- `_promote_submission(submission)`: derives a `FeaturedReleaseRequest`-shaped dict from the submission's `artistas`/`produtores`/`titulo`/`genero`/`descricao`/`links`, validates via the existing `FeaturedReleaseRequest` (submission's tighter caps are always a valid subset), builds the doc via the existing `_featured_document`, and tags `source_submission_id` for traceability.
- `POST /yonkou/submissions/{id}/promote` (CSRF, 20/min): writes only `featured:next` via `_save_featured_next` and marks the submission `promovida` — never calls `_save_featured(` directly (D-06). Re-promoting re-derives `featured:next` idempotently from the submission's current fields. IDOR defense: `submission_id` validated against `JOB_ID_PATTERN` before any Redis lookup; unknown/malformed id -> 404.
- `POST /yonkou/releases/publish-next` (CSRF, 10/min): loads the staged `featured:next`; if absent, 404 ("Nenhum som em featured:next para publicar"). Otherwise retires the current `featured:current` (if any) to `featured:history` via the existing `_append_to_history`, promotes `featured:next` to `featured:current` via `_save_featured`, and clears the staging slot.
- New `_clear_featured_next()` helper: `DELETE`s the Redis key directly (not a `SET` with an empty dict) and removes the fallback JSON file — this matters because the test suite asserts `_redis.get("featured:next") is None` after publish, and a `SET` with `"{}"` would leave a truthy string in Redis even though `_load_featured_next()` would still read it as `None`.
- Updated `.planning/SECURITY-CHECKLIST.md`: checked off the promote/publish items under SEC-SUBMIT-03 and SEC-SUBMIT-06, added a new SEC-SUBMIT-07 subsection documenting the two-step promote/publish flow, replaced the resolved "promote/publish deferred" note in section 9 with the accepted T-16-02 residual risk (stale `featured:next` after a late submission edit), and added a Phase 16 (16-04) row to the change-history table.
- Marked `SUBMIT-06`, `SUBMIT-07` complete in `.planning/REQUIREMENTS.md` (both requirements list and traceability table); `SEC-SUBMIT-03` was already marked complete by Plan 16-03 (its remaining promote/publish sub-items are now also checked in the checklist body).

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive helper + POST promote endpoint** - `321c40e` (feat)
2. **Task 2: POST publish-next endpoint** - `11aa361` (feat)

**Deviation (Security Gate documentation, Rule 2):** `d1d2065` (docs) - SECURITY-CHECKLIST.md update, mandated by CLAUDE.md's Security Gate.

**Plan metadata:** REQUIREMENTS.md traceability rows updated via `gsd-sdk query requirements.mark-complete`; committed together with this SUMMARY.md by the worktree agent per parallel-execution protocol (STATE.md/ROADMAP.md are owned by the orchestrator, not this worktree).

## Files Created/Modified
- `api/main.py` - Added `_promote_submission()`, `promote_submission` (`POST /yonkou/submissions/{id}/promote`), `_clear_featured_next()`, `publish_next_release` (`POST /yonkou/releases/publish-next`)
- `.planning/SECURITY-CHECKLIST.md` - Checked off promote/publish items under SEC-SUBMIT-03/06, added SEC-SUBMIT-07 (two-step promote/publish), updated section 9 (deferred threats) and section 11 (change history)
- `.planning/REQUIREMENTS.md` - Marked SUBMIT-06/SUBMIT-07 complete in both the requirements list and the traceability table

## Decisions Made
- Promote re-derives `featured:next` idempotently on every call rather than detecting "already promoted, should I re-derive?" — matches the task-level decision locked in the plan (16-RESEARCH.md Open Question #1). If an operator edits a submission after promoting it, they must re-click "Promover" before publishing; this is documented, accepted residual risk (T-16-02), not a bug.
- Clearing `featured:next` uses `_redis.delete()` directly rather than routing through `_save_featured_next({})`, specifically so a raw `_redis.get("featured:next")` reads back `None` post-publish (matches the test suite's exact assertion and avoids a subtle mismatch between "empty dict" and "key absent" at the Redis layer).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated SECURITY-CHECKLIST.md with promote/publish controls**
- **Found during:** After Task 2, pre-SUMMARY security-gate self-review
- **Issue:** CLAUDE.md's Security Gate mandates that `.planning/SECURITY-CHECKLIST.md` stay the source of truth for active controls, and that any new control update it. The plan's tasks did not include an explicit checklist-update step, and the existing SEC-SUBMIT-03 entry had a stale note marking promote/publish as "ainda RED" from Plan 16-03.
- **Fix:** Checked off the promote/publish CSRF and IDOR items under SEC-SUBMIT-03/06, added a new "SEC-SUBMIT-07 — Promote/publish e um fluxo de dois passos explicito (D-06/D-07)" subsection, replaced the resolved deferred-item note in section 9 with the accepted T-16-02 residual risk, and added a Phase 16 (16-04) row to the change-history table (section 11).
- **Files modified:** `.planning/SECURITY-CHECKLIST.md`
- **Verification:** `grep -n "^## [0-9]" .planning/SECURITY-CHECKLIST.md` confirms a clean 1-11 sequence with no duplicates; `grep -n "JOB_ID_PATTERN.match(submission_id)" api/main.py` confirms 3 occurrences as documented.
- **Committed in:** `d1d2065`

---

**Total deviations:** 1 auto-fixed (1 missing critical/documentation)
**Impact on plan:** Required by CLAUDE.md's Security Gate precedence clause. No scope creep — purely documentation, no code behavior changed.

## Issues Encountered

- **Worktree branch base was stale at agent start.** This worktree's HEAD was still at the pre-wave-3 commit (`d0a2b57`) even though Plan 16-04 `depends_on: ["03"]` and the parallel-execution briefing assumed waves 1-3 were already merged. The mandatory `merge-base` check against the expected base commit (`3751779`, "docs(phase-16): update tracking after wave 3") caught the mismatch; `git reset --hard` to that commit (per the documented worktree-branch-check protocol) brought in all of Plan 16-01/02/03's work before any implementation began. No plan work was lost or duplicated — this was purely a pre-execution correction, verified by confirming `_load_featured_next`/`_save_featured_next`/`_get_submission`/`_update_submission` and all of Plan 16-03's routes were present after the reset.
- **17 pre-existing failures in the full `pytest` run (not `test_security.py`) are out of scope:** 9 in `tests/test_api.py` are Redis `ConnectionError`s (no Redis server running in this sandbox — an environment condition, not caused by this plan's changes) and 8 in `tests/test_frontend.py` are RED stubs scoped to sibling Plans 16-05/16-06 (frontend form + Yonkou tab wiring), confirmed unrelated to `api/main.py`'s promote/publish additions. `tests/test_security.py` itself: 56 passed, 0 failed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The two-step promote -> publish flow (D-06/D-07) is fully wired: `test_promote_submission_writes_featured_next`, `test_publish_next_moves_current_to_history`, and `test_submission_admin_mutations_require_csrf` are all GREEN.
- Full `tests/test_security.py` run: 56 passed, 0 failed — no regressions from prior waves.
- Plans 16-05 (participar form + Yonkou Submissões tab frontend) and 16-06 can proceed; both depend on this plan's backend endpoints being stable, which they now are.
- No blockers identified.

---
*Phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-*
*Completed: 2026-07-22*
