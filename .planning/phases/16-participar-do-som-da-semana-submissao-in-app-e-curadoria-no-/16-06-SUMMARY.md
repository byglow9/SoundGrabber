---
phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
plan: 06
subsystem: ui+docs
tags: [vanilla-js, y2k-frontend, xss-safe-rendering, csrf, curation, security-checklist, checkpoint]
status: partial — awaiting human checkpoint (Task 3)

# Dependency graph
requires:
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 03)
    provides: "GET/PATCH/reject/archive submission admin endpoints, JOB_ID_PATTERN IDOR-defense convention, _admin_csrf_dependency"
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 04)
    provides: "POST /yonkou/submissions/{id}/promote and POST /yonkou/releases/publish-next (two-step promote/publish)"
  - phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no- (Plan 05)
    provides: "Public #participar-form (POST /submissions) — the source of the submissions this tab curates"
provides:
  - "Yonkou 'Submissões' tab: lists all submissions, drives edit/promote/publish/reject/archive"
  - "XSS-safe admin rendering pattern: all submission-derived DOM built via document.createElement + textContent/.value, never innerHTML"
  - "SECURITY-CHECKLIST.md § 8 fully checked (SEC-SUBMIT-01..07) with Phase 16 (16-06) change-history row"
  - "REQUIREMENTS.md traceability: all of SUBMIT-01..11 and SEC-SUBMIT-01..05 marked Complete"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-rendered tab/panel scaffolding contains zero user-controlled data — only escape()-safe static text and empty containers; all submission data is fetched and rendered client-side via createElement, so the XSS trust boundary is enforced entirely in yonkou.js, not in _operator_panel_html"
    - "Dedicated submissao-* container ids/functions (createSubmissaoArtistaRow, submissaoArtistasFromForm, etc.) parallel the existing featured-editor artista/produtor list helpers instead of refactoring them — avoids regression risk in already-tested code, at the cost of some duplication"
    - "Row actions (promote/publish-next/reject/archive) reuse the existing csrfHeaders() helper via a shared submissaoMutationFetch(url, method, onSuccess) wrapper"

key-files:
  created: []
  modified:
    - api/main.py
    - static/yonkou.js
    - static/style.css
    - .planning/SECURITY-CHECKLIST.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Inline edit form (#submissao-edit-section) duplicates the artista/produtor row-builder pattern under new submissao-prefixed container ids rather than parameterizing/reusing the existing #artistas-list-bound functions, to avoid touching code already covered by passing tests for the featured-release editor."
  - "Publish button appears per submission row (not as a single global action) per the plan's literal task wording ('POST publish-next' listed among per-row actions) even though publish-next is a global operation on whatever is currently staged in featured:next — this matches the existing two-step promote/publish design from Plan 16-04."
  - "Reused existing CSS class selectors (.yonkou-label-cell, .yonkou-links-cell, .artista-row, .produtor-row, etc.) for the new submissao-edit-table/submissao-links-table by adding comma-joined selectors, rather than duplicating style declarations, to keep the Y2K look consistent without new visual language."

requirements-completed: [SUBMIT-01, SUBMIT-02, SUBMIT-03, SUBMIT-04, SUBMIT-05, SUBMIT-06, SUBMIT-07, SUBMIT-08, SUBMIT-09, SUBMIT-10, SUBMIT-11, SEC-SUBMIT-01, SEC-SUBMIT-02, SEC-SUBMIT-03, SEC-SUBMIT-04, SEC-SUBMIT-05]

# Metrics
duration: ~50min (Tasks 1-2, up to checkpoint)
completed: 2026-07-22
---

# Phase 16 Plan 06: Submissões Tab + Documentation Summary (PARTIAL — checkpoint pending)

**Added a "Submissões" tab to the Yonkou operator panel that lists all public submissions and drives the full curation lifecycle (edit/promote/publish/reject/archive) with fully XSS-safe rendering (createElement + textContent/.value, never innerHTML) and CSRF-protected mutations; closed out SECURITY-CHECKLIST.md/REQUIREMENTS.md traceability for the whole Phase 16 SUBMIT-*/SEC-SUBMIT-* set. Task 3 (human end-to-end verification) is a blocking checkpoint — this plan STOPS here pending human sign-off.**

## Performance

- **Duration:** ~50 min (Tasks 1-2 only)
- **Started:** 2026-07-22T~ (worktree branch check + context load)
- **Tasks completed:** 2 of 3 (Task 3 is the human checkpoint — not yet reached/approved)
- **Files modified:** 5 (api/main.py, static/yonkou.js, static/style.css, .planning/SECURITY-CHECKLIST.md, .planning/REQUIREMENTS.md)

## Accomplishments

- `_operator_panel_html` (api/main.py): added `tab-submissoes-btn` to `#yonkou-tabs` and a `#tab-submissoes-panel` (server scaffolding only — an empty `#submissoes-list` container, no user data server-rendered). Added a dedicated `#submissao-edit-section` (mirrors the existing `#form-section`/`#updates-form-section` idiom) with a full field set: artistas (dynamic add/remove, max enforced server-side), produtores, titulo, genero, youtube_url, descricao, contato (instagram/telefone/email), and 4 fixed label/url link slots.
- `static/yonkou.js`: extended `showYonkouTab`/`wireYonkouTabs` to a 3-tab model (`som`/`updates`/`submissoes`), auto-loading the submissions list on tab activation. Added `loadSubmissoes()` (GET `/yonkou/submissions`) and `renderSubmissoesTable()` which builds the entire table — including every submission-controlled cell (titulo, artista names, genero, status, contact info) — via `document.createElement` + `textContent`, so a payload like `<script>alert(1)</script>` in any field renders as literal text in the operator's browser (never executes).
- Wired 5 curation actions per row: **Editar** (opens the inline edit form pre-filled via `.value`, never `innerHTML`), **Promover** (`POST /yonkou/submissions/{id}/promote`), **Publicar** (`POST /yonkou/releases/publish-next`), **Rejeitar** (`POST /yonkou/submissions/{id}/reject`), **Arquivar** (`POST /yonkou/submissions/{id}/archive`) — all four mutation fetches (plus the edit form's `PATCH`) go through `csrfHeaders()`, which reads `x-csrf-token` from the panel's `data-csrf-token` attribute (SEC-SUBMIT-03).
- `static/style.css`: added Y2K table styling for `#submissoes-list` (bordered rows/cells, orange-on-black, uppercase headers) and extended existing form/links/header selectors (`.yonkou-label-cell`, `.yonkou-links-cell`, `#yonkou-form-table`, `#yonkou-links`, `#yonkou-links-table`, `#form-header-table`, plus their mobile media-query counterparts) to also style the new `#submissao-edit-table`/`#submissao-links`/`#submissao-links-table`/`#submissao-edit-header-table` — no new visual language, no flexbox/grid added.
- `.planning/SECURITY-CHECKLIST.md` § 8: checked off SEC-SUBMIT-01/02/04/05's internal bullet points (they were implemented and GREEN from Plans 16-02/16-03 but the checkboxes had been left unchecked), extended SEC-SUBMIT-05 to explicitly cover the new Submissões tab's XSS-safe rendering guarantee (Pitfall 5 / T-16-02), added a "4.7 Verificar controles Submissoes/curadoria (Phase 16)" block to the end-to-end verification section (`pytest tests/test_security.py -k submission`, `pytest tests/test_frontend.py -k "participar or yonkou_has_submissions_tab"`), and added a Phase 16 (16-06) row to the change-history table.
- `.planning/REQUIREMENTS.md`: flipped `SUBMIT-09` (retention cap eviction) from Pending to Complete in both the requirements list and the traceability table — it was already implemented (`_enforce_submissions_cap`) and covered by a passing test (`test_submissions_cap_evicts_terminal_only`), just never marked done. All of `SUBMIT-01..11` and `SEC-SUBMIT-01..05` (16 requirements) are now `Complete`.

## Task Commits

Each completed task was committed atomically:

1. **Task 1: Submissões tab — panel HTML + yonkou.js wiring (XSS-safe)** - `312f829` (feat)
2. **Task 2: Document controls in SECURITY-CHECKLIST.md + REQUIREMENTS.md traceability** - `95d2fdd` (docs)

**Task 3 (checkpoint:human-verify, gate="blocking") has NOT been executed** — this plan stops here per the non-autonomous execution contract. A fresh agent (or the orchestrator) must resume from Task 3 after human verification of the end-to-end flow (submit → admin list → edit → promote → publish → reject/archive → XSS-safe rendering check), per the plan's `<how-to-verify>` steps.

## Files Created/Modified

- `api/main.py` — `_operator_panel_html`: added `tab-submissoes-btn`, `#tab-submissoes-panel`, `#submissao-edit-section` (server scaffolding only, no user data)
- `static/yonkou.js` — 3-tab `showYonkouTab`/`wireYonkouTabs`; `loadSubmissoes`/`renderSubmissoesTable`/`createSubmissaoRow` (XSS-safe list rendering); submissao artista/produtor/link form helpers; `openSubmissaoEditor`/`wireSubmissaoEditor` (PATCH); promote/publish/reject/archive wiring via `submissaoMutationFetch`
- `static/style.css` — `#submissoes-list` table styling; extended form/links/header CSS selectors to cover the new submissao edit form and its mobile breakpoint
- `.planning/SECURITY-CHECKLIST.md` — § 8 checkboxes closed, SEC-SUBMIT-05 extended for admin XSS-safety, new § 10 verification block, new § 11 change-history row (16-06)
- `.planning/REQUIREMENTS.md` — SUBMIT-09 flipped to Complete (list + traceability table)

## Decisions Made

- Kept the submissao edit form's artista/produtor/link helpers as parallel, dedicated functions (container ids prefixed `submissao-`) rather than refactoring the existing featured-editor helpers to accept a container-id parameter — minimizes risk to already-tested, working code for a plan whose primary constraint is XSS/CSRF correctness, not DRY-ness.
- Kept "Publicar" (publish-next) as a per-row button even though it is a global mutation on whatever is staged in `featured:next` — this matches the plan's literal task wording and the existing two-step promote/publish UX from Plan 16-04 (the operator promotes a specific submission, then publishes whatever is staged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Checked off stale unchecked SEC-SUBMIT-01/02/04/05 checkboxes in SECURITY-CHECKLIST.md § 8**
- **Found during:** Task 2, while verifying the plan's own acceptance criteria against the checklist
- **Issue:** SEC-SUBMIT-01/02/04/05's internal verification checkboxes were still `[ ]` even though the corresponding controls were implemented and GREEN (confirmed via `pytest tests/test_security.py -k "submission_rate_limit or submission_honeypot_silently_dropped or submission_body_size_enforced or submission_response_excludes_contact"` — 4 passed) since Plans 16-02/16-03. This was a documentation lag, not a missing control.
- **Fix:** Checked off all four sections' internal bullet points; extended SEC-SUBMIT-05 with an explicit bullet + verification command covering the new Submissões tab's XSS-safe admin rendering (which this plan's Task 1 implements).
- **Files modified:** `.planning/SECURITY-CHECKLIST.md`
- **Verification:** Re-ran the 4 named security tests (all GREEN); `grep -q "SEC-SUBMIT-05"` still matches.
- **Committed in:** `95d2fdd`

**2. [Rule 1 - Bug] Flipped SUBMIT-09 to Complete in REQUIREMENTS.md**
- **Found during:** Task 2, while flipping the SUBMIT-01..11/SEC-SUBMIT-01..05 traceability rows per the plan's explicit instruction
- **Issue:** SUBMIT-09 (retention cap, D-02) was marked Pending in both the requirements list and traceability table, but `_enforce_submissions_cap()` was already implemented (Plan 16-02) and covered by a passing test (`test_submissions_cap_evicts_terminal_only`, confirmed GREEN).
- **Fix:** Flipped `[ ]` → `[x]` in the requirements list and `Pending` → `Complete` in the traceability table.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Verification:** `grep -c "SUBMIT-.*Complete" .planning/REQUIREMENTS.md` → 16 (all of SUBMIT-01..11 + SEC-SUBMIT-01..05).
- **Committed in:** `95d2fdd`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — correcting stale documentation state to match already-implemented, already-tested controls). No scope creep; no behavior changed.

## Issues Encountered

- **Worktree branch base was stale at agent start**, same pattern documented in Plan 16-04's SUMMARY. The mandatory `merge-base` check against the expected base commit (`5d8806285cd1e1f6a736b734ca144dcacea3a784`, "docs(phase-16): update tracking after wave 4") caught that this worktree's HEAD was still at `d0a2b57` ("save state", pre-dating the Wave 4 merge). `git reset --hard` to the expected base (per the documented protocol) brought in all of Plans 16-01 through 16-05's work before any implementation began. No plan work was lost or duplicated — verified `_get_submission`/`_update_submission`/`_promote_submission`/`publish_next_release`/`#participar-form` were all present after the reset.
- **No `.venv` inside this worktree** (git-ignored, not part of the git tree). Used the main project's `.venv` at `/home/glow/Documentos/projetos/SoundGrabber2.0/.venv/bin/python` directly from the worktree's cwd — works because Python venvs are relocatable-by-invocation (absolute interpreter path), and site-packages/imports don't depend on cwd.
- **10 pre-existing failures in the full `pytest` run (not scoped to `test_security.py`/`test_frontend.py`)** are Redis `ConnectionError`s in `tests/test_api.py` — no Redis server running in this sandbox, an environment condition unrelated to this plan's changes (same pattern documented in Plan 16-04's SUMMARY). `tests/test_security.py` (56 tests) and `tests/test_frontend.py` (26 tests) together: **82 passed, 0 failed**.

## User Setup Required

**Task 3 (human checkpoint) requires the following before it can be verified — see the CHECKPOINT REACHED message returned alongside this SUMMARY:**
- Run `./start.sh` (Redis + Celery + Uvicorn) locally.
- Follow the 9 verification steps in the plan's `<how-to-verify>` block (submit → rate-limit → admin list → edit → promote → publish → reject/archive → XSS-safe rendering check).

## Next Phase Readiness

- Tasks 1 and 2 are complete, committed, and self-verified (see Self-Check below). All automated acceptance criteria for both tasks pass.
- Task 3 is a **blocking checkpoint** (`gate="blocking"`) — per the non-autonomous execution contract for this plan, no further automated work should proceed until a human approves the end-to-end flow or reports an issue.
- Once Task 3 is approved, Phase 16 is functionally complete: all 16 Phase-16 requirements (SUBMIT-01..11, SEC-SUBMIT-01..05) are marked Complete in REQUIREMENTS.md, and SECURITY-CHECKLIST.md § 8 fully documents SEC-SUBMIT-01..07.

---
*Phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-*
*Status: PARTIAL — awaiting Task 3 human checkpoint*

## Self-Check: PASSED

- FOUND: api/main.py
- FOUND: static/yonkou.js
- FOUND: static/style.css
- FOUND: .planning/SECURITY-CHECKLIST.md
- FOUND: .planning/REQUIREMENTS.md
- FOUND commit 312f829 (Task 1: Submissões tab — panel HTML + yonkou.js wiring)
- FOUND commit 95d2fdd (Task 2: SECURITY-CHECKLIST.md + REQUIREMENTS.md traceability)
