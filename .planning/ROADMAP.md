### Phase 16: Participar do Som da Semana - submissao in-app e curadoria no admin

**Goal:** Substituir o fluxo de submissão por email por um formulário público in-app que persiste as submissões, com uma seção de curadoria no admin (Yonkou) para listar, editar, promover a próximo Som da Semana, publicar, rejeitar e arquivar — impecável em funcionalidade e segurança (endpoint público de escrita sob Security Gate à risca)
**Requirements**: SUBMIT-01..11, SEC-SUBMIT-01..05 (novos, v1.4)
**Depends on:** Phase 15
**Plans:** 2/6 plans executed

Plans:
- [x] 16-01-PLAN.md — Wave 1 (TDD RED): define REQ-IDs v1.4 em REQUIREMENTS.md + stubs RED em tests/test_security.py (14) e tests/test_frontend.py (7)
- [x] 16-02-PLAN.md — Wave 2: settings (config.py) + models SubmissionRequest/SubmissionContact (model_validator, caps apertados, honeypot) + storage Hash+SortedSet+fallback com cap por estado terminal + helpers featured:next
- [ ] 16-03-PLAN.md — Wave 3: POST /submissions (rate limit 3/hora + honeypot silencioso + sem echo de contato) + admin GET list / PATCH edit / reject / archive (CSRF + validação de id)
- [ ] 16-04-PLAN.md — Wave 4: promoção em dois passos — promote (deriva featured:next) + publish-next (featured:next → featured:current, atual → featured:history), ambos sob CSRF
- [ ] 16-05-PLAN.md — Wave 4: formulário Y2K em #section-participar (POST /submissions, honeypot off-canvas, nota de privacidade) + remoção do fluxo email/template + atualização da Política de Privacidade (index.html + about.html)
- [ ] 16-06-PLAN.md — Wave 5: aba Submissões no Yonkou (render XSS-safe, ações de curadoria com CSRF) + SECURITY-CHECKLIST.md + traceability + checkpoint humano do fluxo E2E

---

*Roadmap created: 2026-04-29*
*v1.1 phases appended: 2026-05-09*
*v1.2 phases appended: 2026-05-10*
*v1.3 phases appended: 2026-05-14*
