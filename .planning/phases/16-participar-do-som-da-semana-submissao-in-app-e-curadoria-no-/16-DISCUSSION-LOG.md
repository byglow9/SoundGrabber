# Phase 16: Participar do Som da Semana — submissão in-app e curadoria no admin - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-
**Areas discussed:** Storage das submissões, Anti-spam / abuso, Ciclo de vida & promoção, Contato do remetente & privacidade

---

## Storage das submissões

| Option | Description | Selected |
|--------|-------------|----------|
| Redis + fallback JSON | Mesmo padrão do featured/updates; zero migração; consistente | ✓ |
| SQLite relacional | Banco agora (tabelas submissions/artists/...); histórico durável mas +manutenção | |
| Redis agora, relacional depois | Redis nesta fase, banco em fase futura | |

**User's choice:** Redis + fallback JSON
**Notes:** Retenção com cap (~200 últimas). Rejeitadas/arquivadas antigas caem fora do cap. Adia o todo relacional para fase futura.

---

## Anti-spam / abuso

| Option | Description | Selected |
|--------|-------------|----------|
| Rate limit + honeypot + limites | Sem dependência externa; respeita CSP self | ✓ |
| Só rate limit | Simples, mas deixa passar bots dentro do limite | |
| Adicionar captcha | Forte, mas script externo quebra CSP e destoa do projeto | |

**User's choice:** Rate limit + honeypot + validação estrita
**Notes:** Rate limit apertado (~3/hora por IP), configurável via env.

---

## Ciclo de vida & promoção

| Option | Description | Selected |
|--------|-------------|----------|
| Pendente → Promovida / Rejeitada / Arquivada | Curadoria real sem virar board complexo | ✓ (estados) |
| Marca como "próximo" (featured:next), publica depois | Controle do momento; combina com "próximo som da semana" | ✓ (promoção) |
| Edita a submissão; promover deriva o featured | Submissão = fonte, featured = derivado (reusa FeaturedReleaseRequest) | ✓ (edição) |

**User's choice:** Estados Pendente/Promovida/Rejeitada/Arquivada; promover = staged em `featured:next` com publicação em passo separado; editar in-place e derivar o featured na promoção.
**Notes:** Publicar move featured:next → featured:current; o atual vai para featured:history.

---

## Contato do remetente & privacidade

| Option | Description | Selected |
|--------|-------------|----------|
| Não — usar links públicos | Mantém "sem dados pessoais"; contato via Instagram/SoundCloud do envio | |
| Email opcional, admin-only | Guardado só no admin; exige nota de privacidade | |
| Email obrigatório | Coleta de todos; atrito | |
| **(Other / free-text do usuário)** | Seção "dados de quem está enviando" com @insta/número/email; ≥1 obrigatório; admin-only | ✓ |

**User's choice (free-text):** "melhor colocar um local no forms de envio de som tipo 'dados de quem está enviando' aí deixa colocar o @ do insta, número ou email algo assim e precisa obrigatoriamente ter um campo desse preenchido pra ser entrado em contato se precisar."
**Notes:** Consequência registrada — coleta de dado pessoal exige nota de consentimento no form + atualização da Política de Privacidade (entram no escopo da fase). Pós-envio: mensagem de sucesso, fire-and-forget.

---

## Claude's Discretion

- Nomes das chaves Redis (`submissions:*`, `featured:next`), esquema do JSON de fallback, mecânica do honeypot, layout fino da aba/tabela do admin.

## Deferred Ideas

- **Plan relational storage for editorial content** (todo 2026-05-29) — revisado, não incorporado; fica para fase futura quando a superfície editorial crescer.
