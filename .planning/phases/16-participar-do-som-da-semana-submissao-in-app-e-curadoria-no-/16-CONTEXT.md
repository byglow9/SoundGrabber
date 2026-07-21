# Phase 16: Participar do Som da Semana — submissão in-app e curadoria no admin - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Substituir o fluxo atual de submissão por email por um sistema completo dentro do site:

1. **Formulário público** (substitui o "copiar template + email" de hoje) que grava as submissões de som.
2. **Persistência** das submissões recebidas.
3. **Seção de curadoria no admin (Yonkou)** que lista TODAS as submissões, com ações de: editar informações, promover a próximo Som da Semana, rejeitar e arquivar.
4. **Integração** com o storage do Som da Semana (featured) já existente.

Requisito crítico transversal: impecável em funcionalidade **e** segurança (endpoint público de escrita = superfície de abuso). Segue o Security Gate do CLAUDE.md à risca.

Fora de escopo (outras fases): banco relacional para conteúdo editorial; contas de usuário; acompanhamento/edição da submissão pelo próprio remetente.
</domain>

<decisions>
## Implementation Decisions

### Storage das submissões
- **D-01:** Persistir em **Redis + fallback JSON**, mesmo padrão de `featured:current`/updates. NÃO introduzir banco relacional nesta fase (fila de moderação é baixo volume; o todo relacional fica deferido).
- **D-02:** Retenção com **cap** (~200 últimas, configurável, como `featured:history`=52). Rejeitadas/arquivadas antigas caem fora do cap.

### Anti-spam / abuso (endpoint público de escrita)
- **D-03:** Proteção = **rate limit por IP + honeypot invisível + validação estrita** (tamanho/formato via Pydantic). **Sem captcha de terceiros** (respeita o CSP `self` e a estética sem-tracking).
- **D-04:** Rate limit **apertado** (~**3/hora por IP**), configurável via env em `api/config.py` (padrão `_safe_int`, como os outros limites).

### Ciclo de vida & promoção
- **D-05:** Estados da submissão: **Pendente → Promovida / Rejeitada / Arquivada**.
- **D-06:** "Promover a próximo Som da Semana" = marca como **"próximo"** (novo slot `featured:next`); a publicação (virar `featured:current`) acontece numa **ação explícita** depois — NÃO publica imediatamente. Ao publicar, o `featured:current` atual vai para `featured:history`.
- **D-07:** **Editar** = ajusta os campos na própria submissão (in-place). Promover **deriva** uma release featured reusando `FeaturedReleaseRequest`. Submissão = fonte; featured = derivado.

### Contato do remetente & privacidade
- **D-08:** Seção **"Dados de quem está enviando"** no formulário, com campos de contato: **@ do Instagram, número/telefone, email**. **Pelo menos um obrigatório** (required-at-least-one, não todos). Visível **somente no admin**, nunca público.
- **D-09:** Como isso coleta **dado pessoal de contato**, entram no escopo desta fase: (a) **nota de consentimento/privacidade** curta no formulário; (b) **atualizar a Política de Privacidade** (`static/index.html` #section-privacidade e `static/about.html`) refletindo a coleta.
- **D-10:** Pós-envio = **mensagem de sucesso na tela**, fire-and-forget (sem contas, sem código de referência).

### Campos do formulário (som)
- **D-11:** Herdar os campos do template atual (`participarTemplate` em `nav.js`) e a estrutura do `FeaturedReleaseRequest`: artista/grupo + link, produtor/beatmaker + link, título da faixa, gênero, **link do YouTube (obrigatório** — necessário para o player), descrição (2–3 frases), **até 4 links extras**. + a seção de contato (D-08).

### Segurança (Security Gate — obrigatório)
- **D-12:** Novo endpoint público `POST` de submissão → `@limiter.limit` (D-04) + Pydantic `BaseModel` com `field_validator` + body size limit + **teste em `tests/test_security.py`** (rate limit + validações). Endpoints admin (listar/editar/promover/publicar/rejeitar/arquivar) sob `_admin_required_dependency` + `_admin_csrf_dependency`. Atualizar `SECURITY-CHECKLIST.md` e adicionar REQ-ID novo em `REQUIREMENTS.md`.

### Claude's Discretion
- Nomes exatos das chaves Redis (ex.: `submissions:queue`, `featured:next`), esquema do JSON de fallback, mecânica precisa do honeypot, e o layout fino da tabela/aba do admin — a critério do planner/executor seguindo os padrões existentes.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Segurança (obrigatório)
- `CLAUDE.md` § "Security Gate" — controles obrigatórios para novo endpoint HTTP (rate limiting, Pydantic `field_validator`, body size, sync routes com `request`/`response`), arquivos em /tmp, e testes. MUST read.
- `.planning/SECURITY-CHECKLIST.md` — fonte de verdade dos controles ativos; ATUALIZAR com a submissão pública e os endpoints admin.
- `.planning/REQUIREMENTS.md` — adicionar REQ-ID novo (categoria SEC-* e/ou feature) para os novos controles.

### Padrões a reusar (código existente)
- `api/main.py:195` — `FeaturedReleaseRequest` (modelo Pydantic do release; promoção deriva daqui).
- `api/main.py:237` — `SystemUpdateRequest` + `/yonkou/updates` (POST admin com CSRF + append em lista): padrão para os endpoints admin de submissão.
- `api/main.py:538/542` — `_admin_required_dependency` / `_admin_csrf_dependency` (auth + CSRF do painel).
- `api/main.py` (~1123) — `/analyze` (endpoint público com rate limit configurável + validação): padrão para o endpoint público de submissão.
- `api/main.py:39-40,433-494` — storage `featured:current`/`featured:history` + fallback JSON (`_write_json_private`, `_get_history`): padrão de persistência.
- `api/config.py` — `_safe_int` + rate limits configuráveis via env.
- `static/nav.js` § `participarTemplate` — campos atuais do envio (fonte dos campos do formulário).
- `static/yonkou.js` — estrutura de abas do painel admin (adicionar aba "Submissões").
- `static/index.html` #section-participar — seção a ser substituída pelo formulário real.

### Deferido (não ler para implementar, contexto)
- `.planning/todos/pending/2026-05-29-plan-relational-editorial-storage.md` — banco relacional (deferido; ver Deferred Ideas).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FeaturedReleaseRequest` (Pydantic) — a promoção transforma a submissão nesse modelo; reusar validação e estrutura.
- `_admin_required_dependency` / `_admin_csrf_dependency` — auth + CSRF prontos para os endpoints admin de curadoria.
- Storage Redis + fallback JSON (`_write_json_private`, `featured:current`, `featured:history`) — replicar para `submissions:*` e `featured:next`.
- `SystemUpdateRequest` + `/yonkou/updates` — molde de endpoint admin (POST com CSRF, append em lista com cap).
- `/analyze` + rate limit configurável (`api/config.py` `_safe_int`) — molde de endpoint público protegido.
- Painel Yonkou (`yonkou.js`, abas "Som da Semana"/"Notas de Atualização") — adicionar aba "Submissões" seguindo o mesmo padrão.

### Established Patterns
- Todo endpoint novo passa pelo Security Gate (rate limit + Pydantic + body size + teste em `test_security.py`).
- Estética Y2K no site público: tabelas para layout, sem flexbox/grid, hex brutos, sem CSS variables.
- Rate limits configuráveis via env.

### Integration Points
- Promoção grava `featured:next`; a publicação move `featured:next` → `featured:current` (o atual vai para `featured:history`).
- Nova aba no Yonkou consome os endpoints admin de submissão.
- Substituir a seção "Participar" (`static/index.html` #section-participar + `participarTemplate` em `nav.js`) pelo formulário real que faz `POST` na submissão.
</code_context>

<specifics>
## Specific Ideas

- Contato do remetente: seção "Dados de quem está enviando" com @ do Instagram, número/telefone e email; pelo menos um preenchido obrigatoriamente; admin-only.
- "Promover" tem semântica de **próximo** (staged em `featured:next`), com publicação em passo separado — não é publish imediato.
- Fila de moderação simples e enxuta (Pendente/Promovida/Rejeitada/Arquivada), não um board complexo.
</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- **Plan relational storage for editorial content** (`.planning/todos/pending/2026-05-29-plan-relational-editorial-storage.md`) — **revisado, não incorporado**. Esta fase usa Redis + fallback JSON (D-01). O banco relacional fica para uma fase futura dedicada, quando a superfície editorial (Som da Semana + submissões + auditoria) crescer o suficiente para justificar migrações, backups e config de deploy — exatamente o gatilho que o próprio todo previa.

Nenhum scope creep surgiu na discussão — a coleta de contato/privacidade (D-08/D-09) é consequência direta de uma decisão de escopo, não capacidade nova.
</deferred>

---

*Phase: 16-participar-do-som-da-semana-submissao-in-app-e-curadoria-no-*
*Context gathered: 2026-07-21*
