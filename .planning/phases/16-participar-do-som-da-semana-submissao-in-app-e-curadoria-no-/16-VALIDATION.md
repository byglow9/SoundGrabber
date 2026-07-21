---
phase: 16
slug: participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-21
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | project default (`tests/conftest.py` fixtures) |
| **Quick run command** | `.venv/bin/python -m pytest tests/test_security.py -q` |
| **Full suite command** | `.venv/bin/python -m pytest -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `.venv/bin/python -m pytest tests/test_security.py tests/test_frontend.py -q`
- **After every plan wave:** Run `.venv/bin/python -m pytest -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Filled by the planner once PLAN.md tasks exist. Each task that adds an endpoint or
> validation MUST map to an automated test in `tests/test_security.py` (Security Gate) or
> `tests/test_frontend.py`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD_ | _TBD_ | _TBD_ | REQ-_TBD_ | T-16-_TBD_ | _TBD_ | unit | `.venv/bin/python -m pytest tests/test_security.py -q` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_security.py` — casos para o endpoint público de submissão (rate limit 429, validação 422, honeypot, body size) e para os endpoints admin (401/403 sem auth/CSRF)
- [ ] `tests/test_frontend.py` — contrato do formulário Participar e da aba de submissões no Yonkou

*Existing infrastructure (pytest + `tests/conftest.py` fixtures) covers the runtime; new test stubs above are the Wave 0 additions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fluxo visual do formulário e da aba de curadoria (submeter → aparecer no admin → editar → promover → publicar) | _TBD_ | Interação de UI ao vivo | Rodar `./start.sh`, submeter pelo /, logar no /yonkou, promover e publicar |

*Alguns comportamentos de UI só verificáveis manualmente no navegador; a lógica de storage/validação/estado deve ter cobertura automatizada.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
