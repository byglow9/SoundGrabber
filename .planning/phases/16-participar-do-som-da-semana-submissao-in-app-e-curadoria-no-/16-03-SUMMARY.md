---
phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
plan: 03
subsystem: api
tags: [fastapi, pydantic, slowapi, security-gate, csrf, idor-defense]

# Dependency graph
requires:
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 02)
    provides: "SubmissionRequest/SubmissionContact models + Hash+SortedSet storage (_save_submission/_load_submissions/_get_submission/_update_submission/_enforce_submissions_cap)"
provides:
  - "POST /submissions — public write endpoint (202, rate-limited 3/hour, honeypot silent-drop, contact-excluding response)"
  - "GET /yonkou/submissions — admin list (auth-only, 30/min)"
  - "PATCH /yonkou/submissions/{id} — admin in-place edit (CSRF, 20/min) via new SubmissionEditRequest model"
  - "POST /yonkou/submissions/{id}/reject and /archive — admin status transitions (CSRF, 20/min each)"
  - "IDOR defense: JOB_ID_PATTERN validated before any Redis lookup on all three submission_id routes"
affects: [16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SubmissionEditRequest: admin-facing sibling of a public Pydantic model with the public model's website/honeypot field dropped — same caps, same validators, independently measured body-size budget"
    - "Shared _transition_submission_status() helper for reject/archive to avoid duplicating IDOR-check + lookup + persist logic across two nearly-identical routes"

key-files:
  created: []
  modified:
    - api/main.py
    - .planning/SECURITY-CHECKLIST.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "SubmissionEditRequest duplicates SubmissionRequest's field_validators verbatim (minus website) rather than subclassing, since Pydantic v2 does not support cleanly removing a field via inheritance — the plan's own acceptance criteria required an independently measured max-cardinality body size (3711 bytes) for this exact model shape"
  - "_transition_submission_status(submission_id, new_status) factors the IDOR-check + _get_submission + _update_submission sequence shared by reject and archive, keeping both routes to a single line of business logic each"
  - "Placed all three admin submission routes (GET, PATCH, reject/archive helper+routes) directly after the existing /yonkou/releases block to keep admin curation endpoints grouped together, ahead of /yonkou/updates"

requirements-completed: [SUBMIT-01, SUBMIT-02, SUBMIT-03, SUBMIT-04, SUBMIT-05, SUBMIT-08, SEC-SUBMIT-01, SEC-SUBMIT-02, SEC-SUBMIT-03, SEC-SUBMIT-04, SEC-SUBMIT-05]

# Metrics
duration: ~20min
completed: 2026-07-22
---

# Phase 16 Plan 03: Public Intake + Admin Curation Endpoints Summary

**Added `POST /submissions` (3/hour, honeypot-guarded, contact-excluding) and the admin list/edit/reject/archive endpoints, turning 11 of Plan 16-01's RED security stubs GREEN with zero regressions in the 53 pre-existing/already-passing security tests.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T~12:49Z
- **Completed:** 2026-07-22T~13:10Z
- **Tasks:** 3
- **Files modified:** 3 (api/main.py, SECURITY-CHECKLIST.md, REQUIREMENTS.md)

## Accomplishments
- `POST /submissions` (status_code=202, `@limiter.limit(f"{settings.submission_rate_limit_per_hour}/hour")`): persists valid submissions via `_submission_document`/`_save_submission` (Plan 16-02), silently drops honeypot (`website`) hits with an identical response and zero persistence, and returns a fixed `{"status": "recebido"}` body that never contains instagram/telefone/email/contato.
- `GET /yonkou/submissions` (auth-only, 30/min): lists all submissions regardless of status via `_load_submissions()`, mirroring `get_releases`' 204-on-empty shape.
- New `SubmissionEditRequest` Pydantic model (same tightened caps as `SubmissionRequest`, minus the `website` honeypot) backing `PATCH /yonkou/submissions/{id}` (CSRF, 20/min): validates `submission_id` against `JOB_ID_PATTERN` before any Redis lookup, 404s on unknown id, merges validated fields in-place while preserving `id`/`created_at_epoch`/`status`.
- `POST /yonkou/submissions/{id}/reject` and `/archive` (CSRF, 20/min each): transition status to `rejeitada`/`arquivada` via a shared `_transition_submission_status()` helper, same IDOR-defense pattern.
- Verified by direct measurement that the admin edit max-cardinality body (3 artistas + 1 produtor + 4 links, every field at cap) is 3711 bytes, under `_MAX_BODY_BYTES=4096` with no path exception added.
- Updated `.planning/SECURITY-CHECKLIST.md` with a new `SEC-SUBMIT-01..06` section (Security Gate mandatory documentation) and `.planning/REQUIREMENTS.md` traceability rows for all 11 REQ-IDs this plan completes.

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /submissions public endpoint (rate limit + honeypot + no contact echo)** - `4c1c9f1` (feat)
2. **Task 2: Admin GET list + PATCH edit endpoints** - `49c22a2` (feat)
3. **Task 3: Admin reject + archive status transitions** - `2ac9c74` (feat)

**Deviation (Security Gate documentation, Rule 2):** `10593c8` (docs) - SECURITY-CHECKLIST.md update, mandated by CLAUDE.md.

**Plan metadata:** REQUIREMENTS.md traceability rows updated via `gsd-sdk query requirements.mark-complete`; committed together with this SUMMARY.md by the worktree agent per parallel-execution protocol (STATE.md/ROADMAP.md are owned by the orchestrator, not this worktree).

## Files Created/Modified
- `api/main.py` - Added `submit_submission` (`POST /submissions`), `SubmissionEditRequest` model, `get_submissions` (`GET /yonkou/submissions`), `patch_submission` (`PATCH /yonkou/submissions/{id}`), `_transition_submission_status()`, `reject_submission`/`archive_submission` (`POST /yonkou/submissions/{id}/reject|archive`)
- `.planning/SECURITY-CHECKLIST.md` - New section 8 (`SEC-SUBMIT-01..06`), renumbered sections 9-11, added Phase 16 row to section 11 (Historico de mudancas)
- `.planning/REQUIREMENTS.md` - Marked SUBMIT-01/02/03/04/05/08 and SEC-SUBMIT-01/02/03/04/05 complete in both the requirements list and the traceability table

## Decisions Made
- `SubmissionEditRequest` is a full duplicate of `SubmissionRequest`'s validators (minus `website`) rather than a subclass, because Pydantic v2 has no clean mechanism to drop an inherited field, and the plan's acceptance criteria required an independently-measured (3711-byte) max-cardinality body for exactly this field set.
- Reject/archive share a single `_transition_submission_status(submission_id, new_status)` helper to avoid duplicating the IDOR-check + lookup + persist sequence across two routes that differ only in the target status string.
- All new admin submission routes were placed directly after the existing `/yonkou/releases` CRUD block (before `/yonkou/updates`) to keep curation-related admin endpoints visually grouped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated SECURITY-CHECKLIST.md with new SEC-SUBMIT controls**
- **Found during:** After Task 3, pre-SUMMARY security-gate self-review
- **Issue:** CLAUDE.md's Security Gate mandates "`.planning/SECURITY-CHECKLIST.md` eh a fonte de verdade dos controles ativos... Nova feature que adiciona controle DEVE atualizar este arquivo." The plan's tasks did not include an explicit checklist-update step.
- **Fix:** Added a new "## 8. Submissoes publicas e curadoria (Phase 16)" section documenting SEC-SUBMIT-01 through SEC-SUBMIT-06 (rate limit, honeypot, CSRF split, body size, contact exclusion, IDOR defense), renumbered the three subsequent sections (Threats NAO mitigados / Verificacao end-to-end / Historico de mudancas) from 8-10 to 9-11, and added a Phase 16 row to the change history table.
- **Files modified:** `.planning/SECURITY-CHECKLIST.md`
- **Verification:** `grep -n "^## [0-9]" .planning/SECURITY-CHECKLIST.md` confirms a clean 1-11 sequence with no duplicates.
- **Committed in:** `10593c8`

---

**Total deviations:** 1 auto-fixed (1 missing critical/documentation)
**Impact on plan:** Required by CLAUDE.md's Security Gate precedence clause ("Esta secao tem precedencia sobre velocidade de entrega"). No scope creep — purely documentation, no code behavior changed.

## Issues Encountered

- **`test_submission_admin_mutations_require_csrf` and `test_promote_submission_writes_featured_next` remain RED, as expected.** Both tests exercise `POST /yonkou/submissions/{id}/promote` and/or `POST /yonkou/releases/publish-next`, which are explicitly Plan 16-04's scope (this plan's own `<verification>` block states "promote/publish still RED — Plan 04"). Implementing those routes here would duplicate Plan 16-04's own task. Verified reject/archive's CSRF gating independently via `test_reject_and_archive_submission` (passing) and direct grep confirmation that both routes carry `dependencies=[Depends(_admin_csrf_dependency)]`.
- **7 pre-existing `tests/test_frontend.py` RED stubs (participar form + Yonkou Submissões tab) are untouched**, confirmed via `git stash`/re-run comparison to be identical failures before and after this plan's changes — out of scope for a backend-only plan (Plans 16-05/16-06).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 16-04 (Wave 4) can proceed immediately: it needs `_load_featured_next`/`_save_featured_next` (Plan 16-02), `_get_submission`/`_update_submission` (Plan 16-02), and `_load_featured`/`_save_featured`/`_append_to_history` (pre-existing) to implement `POST /yonkou/submissions/{id}/promote` and `POST /yonkou/releases/publish-next`, turning `test_promote_submission_writes_featured_next`, `test_publish_next_moves_current_to_history`, and the remaining two assertions in `test_submission_admin_mutations_require_csrf` GREEN.
- **Bonus GREEN:** `test_submissions_cap_evicts_terminal_only` (SUBMIT-09) already passes as of this plan — this plan's `reject` endpoint plus Plan 16-02's `_enforce_submissions_cap` together fully satisfy the eviction scenario end-to-end, ahead of schedule (SUBMIT-09 was not in this plan's own `requirements` frontmatter but is now unblocked; the full suite run confirms it, `1 passed`).
- Full `tests/test_security.py` run: 53 passed, 3 failed — all 3 failures are `promote`/`publish-next` scoped (Plan 16-04), exactly matching this plan's own `<verification>` expectation.
- No blockers identified.

---
*Phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: api/main.py
- FOUND: .planning/SECURITY-CHECKLIST.md
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/phases/16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-/16-03-SUMMARY.md
- FOUND commit 4c1c9f1 (Task 1: POST /submissions public endpoint)
- FOUND commit 49c22a2 (Task 2: admin GET list + PATCH edit endpoints)
- FOUND commit 2ac9c74 (Task 3: admin reject + archive status transitions)
- FOUND commit 10593c8 (docs: SECURITY-CHECKLIST.md deviation)
