---
phase: 16
slug: participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
status: approved
nyquist_compliant: true
wave_0_complete: true
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

> Each implementation task maps to an automated test in `tests/test_security.py` (Security Gate)
> or `tests/test_frontend.py`. The only exception is the 16-06 Task 3 human-verify checkpoint
> (see Manual-Only Verifications).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01 T1 | 01 | 1 | SUBMIT-01..11 / SEC-SUBMIT-01..05 (defs) | T-16-10 | Requirements traceability exists before code | doc | `grep -Eq "v1.4 Requirements" .planning/REQUIREMENTS.md && grep -q "SEC-SUBMIT-05" .planning/REQUIREMENTS.md` | ⬜ | ⬜ pending |
| 16-01 T2 | 01 | 1 | SEC-SUBMIT-01..05 | T-16-10 | RED security stubs collect + fail (no code yet) | unit | `.venv/bin/python -m pytest tests/test_security.py --collect-only -q` | ⬜ | ⬜ pending |
| 16-01 T3 | 01 | 1 | SUBMIT-10, SUBMIT-11 | T-16-10 | RED frontend contract stubs collect + fail | unit | `.venv/bin/python -m pytest tests/test_frontend.py --collect-only -q` | ⬜ | ⬜ pending |
| 16-02 T1 | 02 | 2 | SEC-SUBMIT-01, SUBMIT-09 | T-16-05 | Rate-limit + cap settings configurable via env | unit | `.venv/bin/python -c "from api.config import Settings; s=Settings(); assert s.submission_rate_limit_per_hour==3; assert s.submissions_cap==200; print('OK')"` | ⬜ | ⬜ pending |
| 16-02 T2 | 02 | 2 | SUBMIT-02, SUBMIT-03, SEC-SUBMIT-04 | T-16-05 | Per-field validation + at-least-one-contact; TRUE max-cardinality body (3 artistas + 1 produtor + 4 links, all fields at cap) measures 3726 bytes < 4KB | unit | `.venv/bin/python -c "import json; from api.main import SubmissionRequest, SubmissionContact; worst={'artistas':[{'nome':'x'*100,'url':'y'*200} for _ in range(3)],'produtores':[{'nome':'x'*100,'url':'y'*200} for _ in range(1)],'titulo':'t'*150,'genero':'g'*150,'youtube_url':'https://www.youtube.com/watch?v=abcdefghijk','descricao':'d'*350,'links':[{'label':'l'*30,'url':'u'*220} for _ in range(4)],'contato':{'instagram':'i'*150,'telefone':'t'*150,'email':'e'*150},'website':''}; n=len(json.dumps(worst, ensure_ascii=False).encode('utf-8')); assert n<4096, n; print('OK', n)"` | ⬜ | ⬜ pending |
| 16-02 T3 | 02 | 2 | SUBMIT-09 | T-16-09 | Cap evicts only terminal (rejeitada/arquivada) | unit | `.venv/bin/python -m pytest tests/test_security.py -k "cap_evicts_terminal" -q` | ⬜ | ⬜ pending |
| 16-03 T1 | 03 | 3 | SUBMIT-01, SUBMIT-02, SUBMIT-03, SEC-SUBMIT-01, SEC-SUBMIT-02, SEC-SUBMIT-04, SEC-SUBMIT-05 | T-16-03, T-16-08, T-16-04, T-16-05 | Public POST: rate-limited, honeypot silent-drop, no contact echo | unit | `.venv/bin/python -m pytest tests/test_security.py -k "post_submission_returns_success or honeypot_silently_dropped or submission_rate_limit or submission_response_excludes_contact or submission_body_size or post_submission_validates or requires_one_contact" -q` | ⬜ | ⬜ pending |
| 16-03 T2 | 03 | 3 | SUBMIT-04, SUBMIT-05, SEC-SUBMIT-03 | T-16-07, T-16-06 | Admin list auth-only; PATCH edit CSRF-gated + id-format validated | unit | `.venv/bin/python -m pytest tests/test_security.py -k "get_submissions_requires_admin or patch_submission_requires_csrf" -q` | ⬜ | ⬜ pending |
| 16-03 T3 | 03 | 3 | SUBMIT-08, SEC-SUBMIT-03 | T-16-07 | Reject/archive transitions CSRF-gated | unit | `.venv/bin/python -m pytest tests/test_security.py -k "reject_and_archive_submission or submission_admin_mutations_require_csrf" -q` | ⬜ | ⬜ pending |
| 16-04 T1 | 04 | 4 | SUBMIT-06, SEC-SUBMIT-03 | T-16-07, T-16-11 | Promote stages featured:next only (no publish), CSRF-gated | unit | `.venv/bin/python -m pytest tests/test_security.py -k "promote_submission_writes_featured_next" -q` | ⬜ | ⬜ pending |
| 16-04 T2 | 04 | 4 | SUBMIT-07, SEC-SUBMIT-03 | T-16-07 | Publish moves next→current, current→history, CSRF-gated | unit | `.venv/bin/python -m pytest tests/test_security.py -k "publish_next_moves_current_to_history or submission_admin_mutations_require_csrf" -q` | ⬜ | ⬜ pending |
| 16-05 T1 | 05 | 4 | SUBMIT-10, SUBMIT-11 | T-16-03 | Y2K table form, required youtube, contact section, off-canvas honeypot | unit | `.venv/bin/python -m pytest tests/test_frontend.py -k "participar_form_is_table_based or participar_form_required_youtube_field or participar_form_has_contact_section or participar_form_has_privacy_note or participar_honeypot_field_hidden_off_canvas" -q` | ⬜ | ⬜ pending |
| 16-05 T2 | 05 | 4 | SUBMIT-10 | T-16-02 | Form POSTs to /submissions; mailto/copy-template removed; textContent-only | unit | `.venv/bin/python -m pytest tests/test_frontend.py -k "participar_email_copy_template_removed" -q` | ⬜ | ⬜ pending |
| 16-05 T3 | 05 | 4 | SUBMIT-11 | T-16-12 | Privacy policy discloses contact-data collection (both pages) | unit | `.venv/bin/python -m pytest tests/test_frontend.py -k "participar_form_has_privacy_note" -q` | ⬜ | ⬜ pending |
| 16-06 T1 | 06 | 5 | SUBMIT-04, SUBMIT-05, SUBMIT-06, SUBMIT-07, SUBMIT-08, SEC-SUBMIT-03, SEC-SUBMIT-05 | T-16-02, T-16-07, T-16-04 | Submissões tab lists XSS-safe, drives curation with CSRF | unit | `.venv/bin/python -m pytest tests/test_frontend.py -k "yonkou_has_submissions_tab" -q` | ⬜ | ⬜ pending |
| 16-06 T2 | 06 | 5 | SEC-SUBMIT-01..05 | T-16-10 | Security controls documented; traceability marked Complete | doc | `grep -q "SEC-SUBMIT-05" .planning/SECURITY-CHECKLIST.md && grep -q "Phase 16" .planning/SECURITY-CHECKLIST.md` | ⬜ | ⬜ pending |
| 16-06 T3 | 06 | 5 | SUBMIT-04..08, SUBMIT-10, SUBMIT-11, SEC-SUBMIT-05 | T-16-02, T-16-04 | Human verifies full submit→curate→publish flow + XSS-safe render | manual | see Manual-Only Verifications | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/test_security.py` — casos para o endpoint público de submissão (rate limit 429, validação 422, honeypot, body size) e para os endpoints admin (401/403 sem auth/CSRF) — authored as RED stubs in Plan 16-01 Task 2 (14 named tests)
- [x] `tests/test_frontend.py` — contrato do formulário Participar e da aba de submissões no Yonkou — authored as RED stubs in Plan 16-01 Task 3 (7 named tests)

*Existing infrastructure (pytest + `tests/conftest.py` fixtures) covers the runtime; the RED test stubs above are the Wave 0 additions authored before any production code.*

---

## Manual-Only Verifications

| Behavior | Requirement | Threat Ref | Why Manual | Test Instructions |
|----------|-------------|------------|------------|-------------------|
| End-to-end visual flow: submeter pelo formulário Participar → aparecer no Yonkou com status Pendente → editar → Promover (staged em featured:next) → Publicar (vira featured:current, antigo vai para history) → Rejeitar/Arquivar | SUBMIT-04..08, SUBMIT-10, SUBMIT-11 | T-16-04 | Interação de UI ao vivo entre página pública, painel admin e sidebar de destaque — não coberta por testes automatizados | 16-06 Task 3 checkpoint: rodar `./start.sh`, submeter em http://localhost:8000/ (Participar), logar em /yonkou com `ADMIN_PASSWORD`, abrir a aba Submissões, editar/promover/publicar/rejeitar/arquivar conforme os passos 1-8 do checkpoint |
| Rendering XSS-safe de campos de submissão no painel operador (payload `<script>alert(1)</script>` renderiza como texto literal) | SEC-SUBMIT-05 | T-16-02 | Verificação de execução de script só observável ao vivo no navegador autenticado | 16-06 Task 3 checkpoint passo 9: submeter um campo com `<script>alert(1)</script>` e confirmar que aparece como texto na aba Submissões, sem alert |
| Mensagem de rate-limit visível ao usuário (429 após >3 submissões) | SEC-SUBMIT-01 | T-16-03 | Mensagem de UI fire-and-forget verificável no navegador | 16-06 Task 3 checkpoint passo 3: submeter >3 vezes seguidas e confirmar mensagem clara de limite |

*A lógica de storage/validação/estado/transição tem cobertura automatizada (tabela acima); apenas o fluxo visual e a prova de renderização XSS-safe dependem do checkpoint humano em 16-06 Task 3.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (16-06 Task 3 is the single documented human-verify checkpoint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (14 security + 7 frontend RED stubs authored in Plan 16-01)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
</content>
