# Security Checklist — SoundGrabber

**Fonte de verdade dos controles de seguranca ativos.** Atualizar sempre que um novo controle for adicionado ou removido. Esta checklist eh referenciada por `CLAUDE.md > Security Gate` e deve estar verde antes de cada deploy de producao.

**Ultima atualizacao:** Phase 11 (Som da Semana)
**Proxima revisao:** v1.2 (CSP sem `'unsafe-inline'`)

## Como usar

1. Antes de cada deploy de producao, percorrer este checklist do topo ao fim.
2. Cada item tem um comando de verificacao automatizada (quando aplicavel).
3. Se um item falhar, NAO fazer deploy ate corrigir ou registrar excecao em `.planning/STATE.md > Key Decisions`.
4. Ao adicionar nova feature, conferir contra `CLAUDE.md > Security Gate` antes do merge.

---

## 1. Filesystem Permissions

### SEC-FILE-01 — WAV files em /tmp criados com 0o600

- [ ] `pipeline.py::download_audio()` chama `os.chmod(wav_path, 0o600)` antes de `return wav_path`
- **Verificacao:** `pytest tests/test_security.py::test_wav_file_permissions -x`
- **Verificacao runtime:** apos rodar pipeline com URL valida, `stat -c '%a' /tmp/sg_*.wav` retorna `600`
- **Threat:** Information Disclosure — outros usuarios do OS poderiam ler WAVs sem este chmod

### SEC-FILE-02 — start.sh com permissoes 750

- [ ] `start.sh` tem `chmod 750 "$(realpath "$0")"` apos `set -e`
- **Verificacao:** `pytest tests/test_security.py::test_startsh_permissions -x`
- **Verificacao runtime:** apos `bash start.sh`, `ls -l start.sh` mostra `-rwxr-x---`
- **Threat:** Elevation of Privilege — outros usuarios poderiam executar start.sh

---

## 2. API Rate Limiting

### SEC-API-01 — GET /jobs/{id} rate limit 60/min

- [ ] `api/main.py::get_job` decorado com `@limiter.limit(f"{settings.job_poll_rate_limit_per_minute}/minute")`
- [ ] Assinatura inclui `request: Request, response: Response`
- [ ] `JOB_POLL_RATE_LIMIT_PER_MINUTE` configuravel via env (default 60)
- **Verificacao:** `pytest tests/test_security.py::test_rate_limit_get_jobs -x`
- **Threat:** DoS via polling agressivo

### SEC-API-02 — GET /files/{id} rate limit 10/min

- [ ] `api/main.py::download_file` decorado com `@limiter.limit(f"{settings.file_download_rate_limit_per_minute}/minute")`
- [ ] Assinatura inclui `request: Request, response: Response`
- [ ] `FILE_DOWNLOAD_RATE_LIMIT_PER_MINUTE` configuravel via env (default 10)
- **Verificacao:** `pytest tests/test_security.py::test_rate_limit_get_files -x`
- **Threat:** DoS via download bombing (custo de I/O alto)

### SEC-API-03 — GET /health (liveness Redis)

- [ ] Rota `@app.get("/health")` existe em `api/main.py`
- [ ] Retorna 200 `{"status": "ok"}` quando `_redis.ping()` succeeds
- [ ] Retorna 503 `{"status": "unavailable"}` em `redis.exceptions.ConnectionError` ou `TimeoutError`
- [ ] NAO esta atras de rate limit (intencional — health checks de monitoring)
- **Verificacao:** `pytest tests/test_security.py::test_health_redis_ok tests/test_security.py::test_health_redis_down -x`
- **Threat:** Information Disclosure — body retorna apenas status; nao expoe versao/host/metricas

### POST /jobs rate limit 3/min (Phase 3 — pre-existente)

- [ ] `submit_job` decorado com `@limiter.limit(f"{settings.rate_limit_per_minute}/minute")`
- **Verificacao:** `pytest tests/test_api.py::test_rate_limit_returns_429 -x`

### POST /analyze rate limit 8/min (configuravel)

- [ ] `submit_analyze` decorado com `@limiter.limit(f"{settings.analyze_rate_limit_per_minute}/minute")`
- [ ] `ANALYZE_RATE_LIMIT_PER_MINUTE` configuravel via env (default 8)
- **Justificativa:** elevado de 3 para 8 para acomodar um lote de ate 5 arquivos sequenciais
  no modo ANALISAR (upload continua capado em 50 MB/arquivo; temp 0600 + `sg_`; sweeper).
  Decisao registrada em `STATE.md` (Key Decisions).
- **Verificacao:** `pytest tests/test_security.py::test_analyze_rate_limit -x`

---

## 3. HTTP Hardening (controles ja implementados em api/main.py)

### SEC-TEST-01 — Body size limit 11KB

- [ ] Middleware `_limit_body_size` retorna 413 para `Content-Length > 11264` (subiu de 8192 — SEC-SUBMIT-04, artistas/produtores 3 -> 5)
- **Verificacao:** `pytest tests/test_security.py::test_body_size_limit -x`
- **Threat:** Memory exhaustion via body injection

### SEC-TEST-02 — Security headers

- [ ] Middleware `_security_headers` injeta em TODAS as respostas:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none';`
- **Verificacao:** `pytest tests/test_security.py::test_security_headers -x`
- **Nota:** `'unsafe-inline'` em style-src eh intencional (HTML Y2K usa inline styles); documentado em REQUIREMENTS.md > Out of Scope

### SEC-TEST-03 — /docs /redoc /openapi.json desabilitados em producao

- [ ] FastAPI configurado com `docs_url=None`, `redoc_url=None`, `openapi_url=None` quando `DEBUG != "true"`
- [ ] `.env` de producao NAO tem `DEBUG=true`
- **Verificacao:** `pytest tests/test_security.py::test_docs_routes_disabled -x` (3 testes via parametrize)

### SEC-TEST-04 — Queue depth limit (503)

- [ ] `submit_job` checa `_redis.llen("celery") >= settings.max_queue_depth` (default 50)
- [ ] Retorna 503 `"Service busy. Please try again later."` quando excede
- **Verificacao:** `pytest tests/test_security.py::test_queue_depth_limit -x`
- **Threat:** Queue exhaustion via job spam

### SEC-TEST-05 — Rate limits GET /jobs e GET /files

- [ ] Coberto por SEC-API-01 e SEC-API-02 acima
- **Verificacao:** `pytest tests/test_security.py::test_rate_limit_get_jobs tests/test_security.py::test_rate_limit_get_files -x`

---

## 4. Pre-Deploy Audit

### SEC-TEST-06 — pip-audit antes de cada deploy

- [ ] Documentado em `README.md > Pre-Deploy Security Audit`
- [ ] Comando exato: `pip install pip-audit && pip-audit -r requirements.txt`
- [ ] Politica para vulnerabilidades:
  - HIGH/CRITICAL sem patch -> NAO fazer deploy sem decisao explicita
  - HIGH/CRITICAL com patch -> atualizar dependencia + bump em requirements.txt
  - LOW/MEDIUM -> avaliar caso a caso
- **Verificacao:** rodar `pip-audit -r requirements.txt` e revisar output
- **Verificacao docs:** `grep -q "pip install pip-audit" README.md && grep -q "pip-audit -r requirements.txt" README.md`

---

## 5. Policy & Documentation

### SEC-POLICY-01 — Security Gate em CLAUDE.md

- [ ] Secao `## Security Gate` existe em `CLAUDE.md`
- [ ] Cobre: HTTP endpoints, /tmp files, shell scripts, testes, documentacao
- [ ] Referencia explicita a este checklist e a `tests/test_security.py`
- **Verificacao:** `grep -q "^## Security Gate$" CLAUDE.md`

### SEC-POLICY-02 — Este arquivo

- [ ] `.planning/SECURITY-CHECKLIST.md` existe (este arquivo)
- [ ] Cobre todos os SEC-* da Phase 6
- [ ] Atualizado a cada nova feature que adicione controle
- **Verificacao:** `test -f .planning/SECURITY-CHECKLIST.md`

---

## 6. Infrastructure Security (Phase 7)

### SEC-INFRA-01 — Redis exige autenticacao em producao

- [ ] `api/main.py::_check_redis_auth(redis_url, dev_mode)` levanta `RuntimeError` quando `"@" not in redis_url` e `dev_mode=False`
- [ ] `api/main.py:lifespan` chama `_check_redis_auth(settings.redis_url, settings.dev_mode)` antes de iniciar a sweeper thread
- [ ] `api/config.py::Settings` tem campo `dev_mode: bool` lido da env var `DEV_MODE` (default `False`)
- [ ] Producao Railway: `DEV_MODE` NAO eh definido nas env vars do servico (D-14)
- [ ] Producao Railway: `REDIS_URL` injetado pelo servico Railway Redis tem formato `redis://default:<senha>@redis.railway.internal:6379` (D-08)
- **Verificacao:** `pytest tests/test_security.py::test_redis_auth_required tests/test_security.py::test_redis_auth_bypass_dev_mode tests/test_security.py::test_redis_auth_passes_with_password -x`
- **Verificacao runtime:** apos deploy Railway, logs do servico nao mostram `RuntimeError`; o servico fica em estado "Active" e responde 200 em `/health`
- **Threat:** Elevation of Privilege — Redis sem senha exposto na rede privada Railway permitiria acesso de outros servicos comprometidos

### SEC-INFRA-02 — Uvicorn nao exposto diretamente a internet

- [ ] `railway.toml::[deploy]::startCommand` usa `--host 0.0.0.0 --port $PORT` (necessario para o proxy Railway acessar o container; D-11)
- [ ] Railway PaaS isola o container do acesso direto da internet — todas as requisicoes passam pelo edge proxy Railway que termina TLS e faz forwarding para o container privado
- [ ] `start.sh` (desenvolvimento local) eh separado de `railway.toml` (producao); start.sh roda em `0.0.0.0:8000` na maquina local, fora do escopo do controle de producao (D-12)
- **Verificacao:** `grep -E '^startCommand.*0\.0\.0\.0.*\$PORT' railway.toml`
- **Verificacao runtime:** apos deploy, tentar conexao TCP direta na porta interna do container falha (apenas o subdomain HTTPS Railway responde)
- **Threat:** Spoofing / Tampering — exposicao direta permitiria bypass de TLS e dos headers de seguranca aplicados pelo edge

### SEC-INFRA-03 — HTTPS via Railway (HTTP -> HTTPS 301)

- [ ] Railway PaaS faz HTTPS termination automatico para `*.up.railway.app` (D-04, D-10)
- [ ] Railway PaaS faz redirect 301 HTTP -> HTTPS automatico para GET requests (D-05)
- [ ] Nenhuma configuracao manual necessaria (sem nginx, sem certbot, sem cron de renovacao)
- **Verificacao runtime:** `curl -s -o /dev/null -w "%{http_code}\n" http://<app>.up.railway.app/` retorna `301`
- **Verificacao runtime:** `curl -sI https://<app>.up.railway.app/` retorna `200` com `Server: railway-edge` ou similar
- **Threat:** Tampering (MITM) — HTTPS obrigatorio impede injecao de conteudo em transito

### SEC-INFRA-04 — HSTS header em todas as respostas

- [ ] `api/main.py::_security_headers` injeta `Strict-Transport-Security: max-age=31536000; includeSubDomains` em todas as respostas
- [ ] Header presente em todas as rotas (testado via TestClient em test_hsts_header)
- **Verificacao:** `pytest tests/test_security.py::test_hsts_header -x`
- **Verificacao runtime:** `curl -sI https://<app>.up.railway.app/health | grep -i strict-transport-security` retorna `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Threat:** Tampering (downgrade HTTPS->HTTP) — apos primeira visita HTTPS, browser refuta HTTP por 1 ano

---

## 7. Som da Semana Operator Controls (Phase 11)

### SEC-FEATURED-01 — Public GET /featured rate limit e fallback seguro

- [ ] `api/main.py::get_featured` existe em `@app.get("/featured")`
- [ ] Rota decorada com `@limiter.limit("60/minute")`
- [ ] Assinatura inclui `request: Request, response: Response`
- [ ] Leitura usa Redis `featured:current` e fallback JSON em indisponibilidade do Redis
- **Verificacao:** `pytest tests/test_security.py::test_featured_get_rate_limit -x`
- **Verificacao fallback:** `pytest tests/test_security.py::test_featured_redis_fallback -x`
- **Threat:** DoS / Availability — leitura publica nao pode quebrar o downloader quando Redis falha

### SEC-FEATURED-02 — /yonkou direto, autenticado e rate-limited

- [ ] `api/main.py::yonkou_panel` existe em `@app.get("/yonkou")`
- [ ] Rota decorada com `@limiter.limit("60/minute")`
- [ ] Visitante sem cookie ve somente o painel de login com `Entrar no painel`
- [ ] Pagina publica `/` nao contem link, botao, menu item ou copy expondo `/yonkou`
- **Verificacao:** `pytest tests/test_security.py::test_yonkou_panel_rate_limit tests/test_security.py::test_yonkou_panel_requires_no_public_link -x`
- **Verificacao frontend:** `pytest tests/test_frontend.py::test_public_page_does_not_link_yonkou -x`
- **Threat:** Information Disclosure — reduz descoberta casual da rota operadora sem substituir autenticacao

### SEC-FEATURED-03 — POST /yonkou/login com ADMIN_PASSWORD e cookie assinado

- [ ] `api/main.py::yonkou_login` existe em `@app.post("/yonkou/login")`
- [ ] Rota decorada com `@limiter.limit("5/minute")`
- [ ] Senha vem de `settings.admin_password` / env `ADMIN_PASSWORD`
- [ ] Sessao usa cookie `sg_admin` assinado com `ADMIN_SESSION_SECRET`
- [ ] Cookie tem `HttpOnly` e `SameSite`
- **Verificacao:** `pytest tests/test_security.py::test_yonkou_login_rate_limit tests/test_security.py::test_yonkou_login_sets_secure_session_cookie -x`
- **Threat:** Elevation of Privilege / Spoofing — impede update operador sem senha e sessao assinada

### SEC-FEATURED-04 — POST /featured operador-only com validacao D-03

- [ ] `api/main.py::post_featured` existe em `@app.post("/featured")`
- [ ] Rota decorada com `@limiter.limit("10/minute")`
- [ ] Requer cookie `sg_admin` valido antes de salvar
- [ ] Body usa Pydantic (`FeaturedReleaseRequest`, `FeaturedLink`)
- [ ] Campos D-03 sao obrigatorios e links aceitam no maximo 3 URLs `http`/`https`
- [ ] Armazena o documento atual em Redis `featured:current` e JSON fallback
- **Verificacao:** `pytest tests/test_security.py::test_post_featured_requires_operator_session tests/test_security.py::test_post_featured_validates_links tests/test_security.py::test_post_featured_rate_limit -x`
- **Threat:** Tampering — conteudo publico curado passa por autenticacao e validacao antes de persistir

### SEC-FEATURED-05 — Renderizacao publica XSS-safe

- [ ] `static/app.js` busca `fetch('/featured')` no carregamento
- [ ] Conteudo operador-renderizado usa `textContent`, nao `innerHTML`
- [ ] Links externos usam `target="_blank"` e `rel="noopener"`
- [ ] Sidebar usa card preto/laranja Y2K sem imagem, artwork, embed ou icone de plataforma
- **Verificacao:** `pytest tests/test_frontend.py::test_featured_sidebar_static_contract tests/test_frontend.py::test_featured_links_are_noopener_blank tests/test_frontend.py::test_featured_sidebar_css_contract -x`
- **Verificacao completa Phase 11:** `pytest tests/test_security.py -x -q` e `pytest tests/test_frontend.py -x -q`
- **Threat:** XSS / Tabnabbing — conteudo de operador aparece no browser publico sem HTML injetado e sem acesso a `window.opener`

---

## 8. Submissoes publicas e curadoria (Phase 16)

### SEC-SUBMIT-01 — POST /submissions rate limit apertado (3/hora)

- [x] `api/main.py::submit_submission` existe em `@app.post("/submissions", status_code=202)`
- [x] Rota decorada com `@limiter.limit(f"{settings.submission_rate_limit_per_hour}/hour")`
- [x] `SUBMISSION_RATE_LIMIT_PER_HOUR` configuravel via env (default 3)
- **Verificacao:** `pytest tests/test_security.py::test_submission_rate_limit -x`
- **Threat:** Denial of Service / Repudiation — endpoint publico de escrita sem conta e superficie de spam

### SEC-SUBMIT-02 — Honeypot silencioso (campo `website`)

- [x] `SubmissionRequest.website` (decoy) preenchido retorna o MESMO 202 generico de uma submissao legitima
- [x] Nada e persistido quando o honeypot esta preenchido; nenhum log distinguivel de "spam" (Anti-Pattern)
- **Verificacao:** `pytest tests/test_security.py::test_submission_honeypot_silently_dropped -x`
- **Threat:** Elevation of Privilege — revelar a deteccao ao bot permitiria adaptar o ataque

### SEC-SUBMIT-03 — Mutacoes admin exigem CSRF; leituras exigem apenas sessao

- [x] `GET /yonkou/submissions` usa `dependencies=[Depends(_admin_required_dependency)]` (leitura, sem CSRF)
- [x] `PATCH /yonkou/submissions/{id}`, `POST /yonkou/submissions/{id}/reject` e `/archive` usam `dependencies=[Depends(_admin_csrf_dependency)]`
- [x] `POST /yonkou/submissions/{id}/promote` e `POST /yonkou/releases/publish-next` (Plan 16-04) tambem usam `dependencies=[Depends(_admin_csrf_dependency)]`
- **Verificacao:** `pytest tests/test_security.py::test_get_submissions_requires_admin tests/test_security.py::test_patch_submission_requires_csrf tests/test_security.py::test_reject_and_archive_submission tests/test_security.py::test_submission_admin_mutations_require_csrf -x`
- **Threat:** Spoofing / Tampering — sessao roubada/CSRF poderia forjar edicao, transicao de status ou publicacao

### SEC-SUBMIT-04 — Body size 11KB cobre o payload de cardinalidade maxima

- [x] Nenhuma excecao de path adicionada em `_limit_body_size` para `/submissions` ou `/yonkou/submissions/{id}`
- [x] Artistas/produtores subiram de <=3 para <=5 (pedido explicito do usuario); titulo/genero/nome/contato<=300, descricao<=700 — caps do Plan 16-02/16-06 mantem o payload publico maximo em 8776 bytes e o payload admin de edicao em 8761 bytes — ambos abaixo de `_MAX_BODY_BYTES=11264` (subiu de 8192 junto, remedido e documentado em STATE.md Key Decisions)
- **Verificacao:** `pytest tests/test_security.py::test_submission_body_size_enforced -x`
- **Threat:** Denial of Service — corpo oversized nao deve chegar ao parsing Pydantic (413 antes de 500)

### SEC-SUBMIT-05 — Resposta publica nunca ecoa dados de contato; renderizacao admin XSS-safe

- [x] `POST /submissions` retorna um dict fixo (`{"status": "recebido"}`), sem instagram/telefone/email/contato
- [x] Nao existe endpoint publico de leitura de submissoes (somente `/yonkou/submissions`, autenticado)
- [x] `static/yonkou.js` (Plan 16-06): a aba "Submissões" do painel operador renderiza TODOS os campos de uma submissao (titulo, artista, genero, descricao, contato) via `document.createElement`/`textContent`/`.value` — nunca `innerHTML` ou interpolacao de string — porque o conteudo e controlado pelo submissor e renderiza na sessao autenticada do operador (cookie admin + CSRF token), um alvo de alto valor (Pitfall 5 / T-16-02). `static/featured-card.js` (preview do card + sidebar publica) segue a mesma regra
- **Verificacao:** `pytest tests/test_security.py::test_submission_response_excludes_contact -x`; `pytest tests/test_frontend.py -k yonkou_has_submissions_tab -x`; `pytest tests/test_frontend.py::test_yonkou_submissoes_tab_never_uses_innerhtml -x` (converteu a antiga inspecao manual `grep -n "innerHTML"` em teste automatizado)
- **Threat:** Information Disclosure (dado de contato) + Tampering/Elevation of Privilege (Stored XSS via campo de submissao renderizado na aba admin) — dado pessoal (D-08) nunca deve vazar na resposta publica; conteudo de submissao nunca deve executar script na sessao do operador

### SEC-SUBMIT-06 — IDOR defense em `{submission_id}`

- [x] `PATCH /yonkou/submissions/{id}`, `POST .../reject`, `POST .../archive` e `POST .../promote` validam `submission_id` contra `JOB_ID_PATTERN` ANTES de qualquer lookup no Redis
- [x] Id desconhecido (mas com formato valido) retorna 404
- **Verificacao:** `grep -n "JOB_ID_PATTERN.match(submission_id)" api/main.py` (3 ocorrencias esperadas: `patch_submission`, `_transition_submission_status` compartilhado por reject/archive, `promote_submission`)
- **Threat:** Tampering / Information Disclosure — id malformado nao deve alcancar `_get_submission`/`_update_submission`

### SEC-SUBMIT-07 — Promote/publish e um fluxo de dois passos explicito (D-06/D-07)

- [x] `POST /yonkou/submissions/{id}/promote` escreve SOMENTE `featured:next` (via `_save_featured_next`) e marca a submissao `promovida` — nunca chama `_save_featured(` diretamente
- [x] `POST /yonkou/releases/publish-next` move `featured:next` -> `featured:current`, envia o `featured:current` antigo para `featured:history` (`_append_to_history`), e limpa `featured:next` (`_clear_featured_next` faz `DELETE`, nao um `SET` com dict vazio, para que `_redis.get("featured:next")` volte `None`)
- [x] Sem `featured:next` estagiado, `publish-next` retorna 404 (nada a publicar)
- [x] Re-promover re-deriva `featured:next` idempotentemente a partir dos campos atuais da submissao (decisao de nivel de tarefa, Open Question #1 do 16-RESEARCH.md)
- [x] `publish-next` marca a submissao de origem (`source_submission_id`, gravado por `_promote_submission`) como `publicada` — antes o status ficava travado em `promovida` para sempre e o operador nao tinha confirmacao visivel na aba Submissões de que Publicar funcionou. `publicada` foi adicionada a `SUBMISSION_TERMINAL_STATUSES` (evictavel pelo cap de retencao, SUBMIT-09)
- **Verificacao:** `pytest tests/test_security.py::test_promote_submission_writes_featured_next tests/test_security.py::test_publish_next_moves_current_to_history -x`
- **Threat:** Tampering — publicacao imediata sem o passo de revisao intermediario violaria D-06

### SEC-SUBMIT-08 — Auditoria completa: caps de campo, unicode/controle, SQLi/XSS/SSRF/ReDoS/injecao Redis

Auditoria final pedida explicitamente pelo usuario apos calibrar os caps de
campo para 300/700 (ver STATE.md Key Decisions). Pesquisa externa: FastAPI/
Pydantic OWASP hardening, NoSQL/Redis injection, SSRF/unicode homograph/ReDoS
(2026).

- [x] **Caps de campo recalibrados e re-medidos:** titulo/genero/nome-artista/
  contato subiram de <=150 para <=300; descricao de <=350 para <=700; URLs
  (artista<=200, link<=220) e label de link (<=30) inalterados. Payload de
  cardinalidade maxima remedido: 6676 bytes publico / 6661 bytes admin —
  `_MAX_BODY_BYTES` subiu de 5120 para 8192 para preservar margem (~1516
  bytes, ~23%)
- [x] **Caracteres de controle ASCII bloqueados** (`_reject_control_and_bidi_chars`) em todo campo de texto livre — NUL/ESC/etc. rejeitados com 422; `\n`/`\r`/`\t` permitidos apenas em `descricao` (textarea multi-linha)
- [x] **Overrides Unicode bidi/zero-width bloqueados** (U+200B-U+200F, U+202A-U+202E, U+2066-U+2069, U+FEFF) — evita spoofing visual estilo "Trojan Source" no texto que o operador le antes de aprovar/publicar
- [x] **`youtube_url` valida o charset do video_id** (`^[A-Za-z0-9_-]{11}$`), nao so o tamanho — fecha a lacuna onde um valor percent-encoded (decodificado por `parse_qs`) com exatamente 11 chars poderia conter markup; defesa em profundidade complementar ao regex do frontend (`sgExtractYoutubeId`)
- [x] **SQL injection: nao aplicavel.** Storage e Redis (Hash `submissions:data` + Sorted Set `submissions:index`) via `json.dumps`/`json.loads` — nao existe nenhuma query SQL neste projeto. Payloads estilo `'; DROP TABLE...` sao aceitos e tratados como texto comum (verificado em teste)
- [x] **Redis/NoSQL injection: mitigado por design.** `submission_id` (unica entrada de usuario usada como chave Redis) e validado contra `JOB_ID_PATTERN` (`^[a-zA-Z0-9-]{1,64}$`) ANTES de qualquer lookup (SEC-SUBMIT-06); o client redis-py usa protocolo RESP estruturado (nao concatenacao de comando), entao valores de campo nao alcancam sintaxe de comando Redis. Nenhum uso de `EVAL`/Lua com input de usuario
- [x] **SSRF: nao aplicavel.** Nenhuma chamada HTTP de saida (`requests`/`httpx`/`urlopen`) e feita a partir de URLs fornecidas em submissao — artista/produtor/link URLs sao so armazenados e renderizados como `<a href>` no navegador (nunca fetch server-side); `youtube_url` vira um `<iframe src>` client-side, tambem sem fetch server-side
- [x] **ReDoS: nao aplicavel.** Nenhum regex usado em validacao de input de usuario tem quantificadores aninhados/alternancia sobreposta (`JOB_ID_PATTERN`, `_YOUTUBE_VIDEO_ID_PATTERN`, `_BIDI_UNICODE_PATTERN` sao todos classes de caracteres simples ou `^...{N}$` limitados)
- [x] **Log injection: nao aplicavel aos campos de texto.** Unico log com dado de submissao (`_get_submission`) so inclui `submission_id`, ja validado por `JOB_ID_PATTERN` antes de chegar la — sem CRLF/bytes de controle possiveis
- [x] **XSS: defesa em profundidade.** Payload malicioso (`<script>...</script>`) e aceito/armazenado como texto comum (nao ha por que rejeitar no backend — a defesa real e client-side); renderizacao via `textContent`/`createElement` em `yonkou.js` e `featured-card.js` (nunca `innerHTML`), verificado por teste automatizado (SEC-SUBMIT-05)
- **Verificacao:** `pytest tests/test_security.py -k "control_char or bidi or length_cap or youtube_url_rejects or xss_and_sqli" -v`
- **Threat:** Tampering (dados fora do formato esperado) / Spoofing (bidi override) / Information Disclosure (log injection) / DoS (ReDoS) — nenhum aplicavel alem do que ja mitigado; ver tambem Secao 9 para residuais aceitos (phishing via link legitimo)

---

## 9. Threats NAO mitigados nesta fase (deferidos)

Estes itens estao escopados para v1.2 ou versoes futuras:

- **CSP sem `'unsafe-inline'`** — requer remover inline styles do HTML Y2K (v1.2)
- **Private /tmp directory por job** — `/tmp/sg_{id}/` com `os.mkdir(mode=0o700)` (v2)
- **Job cancellation endpoint** — DELETE /jobs/{id} com auth (v2)
- **Stale `featured:next` publicado apos edicao tardia da submissao (T-16-02)** — aceito como comportamento documentado: o operador deve re-promover apos editar, antes de publicar (Plan 16-04, Open Question #1)
- **Phishing via URL de artista/produtor/link legitima na sintaxe (http/https valido) mas apontando para conteudo malicioso** — inerente a qualquer feature de "adicionar link"; nao ha como validar a INTENCAO de uma URL sindicamente valida. Mitigacao existente: o operador revisa manualmente antes de promover/publicar (curadoria humana e o gate, nao codigo)

---

## 10. Verificacao end-to-end (rodar antes de cada deploy)

Bloco de comandos shell para validar a checklist completa antes de deploy. Cada bloco em fence bash.

```bash
# 1. Suite completa de seguranca
pytest tests/test_security.py -v

# 2. Suite completa do projeto (sem regressao)
pytest tests/ -v -m "not e2e and not integration"

# 3. Audit de dependencias
pip install pip-audit
pip-audit -r requirements.txt

# 4. Permissoes filesystem (apos primeira execucao do start.sh)
ls -l start.sh                     # esperado: -rwxr-x---
stat -c '%a' /tmp/sg_*.wav 2>/dev/null | sort -u  # esperado: 600

# 4.5 Verificar railway.toml e HSTS local
test -f railway.toml && echo "railway.toml OK" || echo "railway.toml MISSING"
grep -q 'startCommand.*0.0.0.0.*$PORT' railway.toml && echo "Railway startCommand OK"
pytest tests/test_security.py::test_hsts_header -q

# 4.6 Verificar controles Som da Semana (Phase 11)
pytest tests/test_security.py -x -q
pytest tests/test_frontend.py -x -q

# 4.7 Verificar controles Submissoes/curadoria (Phase 16)
pytest tests/test_security.py -k submission -q
pytest tests/test_frontend.py -k "participar or yonkou_has_submissions_tab" -q

# 5. Smoke test do health endpoint (com server up)
curl -s http://localhost:8000/health

# 6. Smoke test rate limit POST /jobs (com server up)
for i in $(seq 1 4); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/jobs \
    -H 'Content-Type: application/json' \
    -d '{"youtube_url":"https://www.youtube.com/watch?v=abc"}'
done
# esperado: 202, 202, 202, 429
```

---

## 11. Historico de mudancas

| Data | Phase | Controles adicionados |
|------|-------|----------------------|
| Phase 3 | Hardening | Body size, security headers, docs disabled, queue depth, rate limit POST /jobs |
| Phase 6 | Application Security | WAV chmod 0o600, start.sh chmod 750, rate limit GET /jobs e /files, /health endpoint, pip-audit policy, este checklist |
| Phase 7 | Infrastructure Security | Redis auth enforcement (DEV_MODE bypass), HSTS via FastAPI middleware, Railway PaaS deploy (railway.toml), HTTPS automatico Railway |
| Phase 11 | Som da Semana | `/featured` e `/yonkou` rate-limited, `ADMIN_PASSWORD`, cookie assinado HttpOnly SameSite, validacao Pydantic D-03, Redis `featured:current` com JSON fallback, renderizacao `textContent` e `noopener` |
| Phase 16 (16-03) | Submissoes publicas + curadoria | `POST /submissions` rate-limited 3/hora + honeypot silencioso + resposta sem contato; `GET /yonkou/submissions` (auth-only); `PATCH .../{id}`, `POST .../{id}/reject`, `POST .../{id}/archive` (CSRF); IDOR defense via `JOB_ID_PATTERN` antes do lookup |
| Phase 16 (16-04) | Promote/publish (D-06/D-07) | `POST /yonkou/submissions/{id}/promote` (CSRF, 20/min) escreve somente `featured:next`; `POST /yonkou/releases/publish-next` (CSRF, 10/min) move `featured:next` -> `featured:current` e envia o antigo current para `featured:history`; `_clear_featured_next` usa `DELETE` (nao `SET` vazio) para o contrato de `None` |
| Phase 16 (16-06) | Aba "Submissões" no painel Yonkou (curadoria completa) | Adicionada `tab-submissoes-btn`/`tab-submissoes-panel` em `_operator_panel_html` (scaffolding sem dado de usuario) + secao de edicao inline `submissao-edit-section`; `static/yonkou.js` lista/edita/promove/publica/rejeita/arquiva 100% via `document.createElement` + `textContent`/`.value` (SEC-SUBMIT-05, T-16-02); todas as mutacoes (`PATCH`, `promote`, `publish-next`, `reject`, `archive`) enviam `x-csrf-token` via `csrfHeaders()` (SEC-SUBMIT-03, T-16-07); traceability de SUBMIT-01..11 e SEC-SUBMIT-01..05 fechada em REQUIREMENTS.md; verificacao humana end-to-end do fluxo completo submeter -> curar -> publicar |
