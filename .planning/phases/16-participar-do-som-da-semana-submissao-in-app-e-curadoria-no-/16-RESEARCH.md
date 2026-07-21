# Phase 16: Participar do Som da Semana — submissão in-app e curadoria no admin - Research

**Researched:** 2026-07-21
**Domain:** FastAPI public write endpoint + Redis/JSON persistence + admin curation panel (extending existing Yonkou patterns)
**Confidence:** HIGH — this phase is 90% "replicate an existing, working pattern in this codebase" rather than "evaluate new technology." No new dependencies required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

**Reviewed Todos (not folded):**
- **Plan relational storage for editorial content** (`.planning/todos/pending/2026-05-29-plan-relational-editorial-storage.md`) — **revisado, não incorporado**. Esta fase usa Redis + fallback JSON (D-01). O banco relacional fica para uma fase futura dedicada, quando a superfície editorial (Som da Semana + submissões + auditoria) crescer o suficiente para justificar migrações, backups e config de deploy — exatamente o gatilho que o próprio todo previa.

Nenhum scope creep surgiu na discussão — a coleta de contato/privacidade (D-08/D-09) é consequência direta de uma decisão de escopo, não capacidade nova.
</user_constraints>

## Summary

Phase 16 does not introduce any new technology. `api/main.py` already contains every primitive needed: a Redis+JSON-fallback persistence pair (`featured:current`/`featured:history`), an admin auth+CSRF dependency pair (`_admin_required_dependency`/`_admin_csrf_dependency`), a public rate-limited write endpoint (`/analyze`), and a Pydantic validation style (`field_validator` on nested models). The work is mechanical extension of these patterns to a new resource (`submissions:*`) and a new derived-publish step (`featured:next` → `featured:current`).

The one genuinely new design decision is **mutability**: `featured:history` and `updates:history` are Redis Lists used as **append-only logs** (`LPUSH`/`LTRIM`). Submissions are **not** append-only — they must be individually editable and transition through states (Pendente → Promovida/Rejeitada/Arquivada) while preserving their position for the cap/eviction rule (D-02: only rejected/archived entries age out of the ~200 cap). A List cannot do this cleanly. The research below recommends a Redis Hash (`submissions:data`, field=id, value=JSON) + Sorted Set (`submissions:index`, score=created_at epoch, member=id) pair instead, with a JSON-fallback file shaped as a dict keyed by id (not a list), still written via the existing `_write_json_private` helper.

The second point requiring explicit planner attention is **body size**: the global `_limit_body_size` middleware caps all POST bodies at 4KB except `/analyze` (which has a hardcoded path exception). A submission payload reusing `FeaturedArtist`/`FeaturedLink` list caps (10 artists × ~700 bytes, 4 links × ~540 bytes) can exceed 4KB even in realistic single-artist-plus-links cases once the contact section is added. The planner must decide between (a) tightening list caps specifically for the public submission model (recommended — smaller attack surface, no new escape hatch), or (b) adding a second path-specific exception to `_limit_body_size` mirroring `/analyze`, with the explicit justification comment the Security Gate requires.

**Primary recommendation:** Reuse `FeaturedArtist`/`FeaturedLink` as nested Pydantic models inside a new `SubmissionRequest`, add a `SubmissionContact` model validated with `model_validator(mode="after")` for the "at least one contact field" rule (D-08), add a decoy honeypot field validated inside the same model, store submissions in a Hash+SortedSet pair (not a List), and gate all admin curation mutations behind `_admin_csrf_dependency` exactly like `/yonkou/releases`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Public submission form (HTML/CSS/JS) | Browser / Client | — | Y2K table-based form, client-side only renders/serializes; no business logic |
| Honeypot field rendering + no-op on real users | Browser / Client | API / Backend | Field must be invisible client-side; validation of emptiness happens server-side |
| Submission validation (Pydantic) | API / Backend | — | `field_validator`/`model_validator` — same tier as all existing validation in this codebase |
| Rate limiting (per-IP, per-hour) | API / Backend | — | slowapi + Redis-backed `limiter`, identical mechanism to existing endpoints |
| Submission persistence (Hash+SortedSet+JSON fallback) | Database / Storage | API / Backend | Mirrors `featured:current`/`featured:history` split; API owns read/write functions |
| Admin curation list/edit/promote/reject/archive | API / Backend | Database / Storage | Mutations happen server-side under `_admin_csrf_dependency`; storage just persists state |
| Admin curation UI (new Yonkou tab) | Browser / Client | API / Backend | `yonkou.js` tab pattern; fetches/posts to admin endpoints |
| `featured:next` → `featured:current` publish step | API / Backend | Database / Storage | New explicit action; reuses `_save_featured`/`_append_to_history` primitives |
| Privacy policy content update | Browser / Client (static HTML) | — | Pure content change in `static/index.html`/`static/about.html`, no logic |

## Standard Stack

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.136.1 | HTTP layer for new endpoints | Already the project's only web framework [VERIFIED: requirements.txt + `pip show`] |
| Pydantic | 2.13.3 | `SubmissionRequest`/`SubmissionContact` validation | Already a FastAPI dependency; v2 `model_validator(mode="after")` supports the cross-field "at least one contact" rule [VERIFIED: `.venv` install] |
| slowapi | 0.1.9 | Rate limiting on the new public endpoint and admin endpoints | Pinned `==` per project convention; already wraps the shared Redis-backed `limiter` [VERIFIED: requirements.txt] |
| limits | 5.8.0 (transitive, via slowapi) | Rate string parsing, incl. `"N/hour"` | `parse("3/hour")` confirmed to resolve to `Granularity(seconds=3600)` [VERIFIED: local venv `python -c "from limits import parse; parse('3/hour')"`] |
| redis-py | (pinned in requirements.txt) | Hash/SortedSet primitives for submissions storage | Already the project's only Redis client; `_redis` module-level instance is reused | 
| itsdangerous | (pinned) | Admin session cookie + CSRF token (unchanged) | Already used for `ADMIN_COOKIE_NAME`/CSRF; no new admin auth needed, only new dependencies on existing `_admin_csrf_dependency` |

### Supporting
No supporting/new libraries are required for this phase. D-03 explicitly rules out third-party captcha. All anti-abuse tooling (rate limit, honeypot, strict Pydantic validation) is implementable with what is already installed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Redis Hash + Sorted Set for submissions | Redis List (`LPUSH`/`LTRIM`, same as `featured:history`) | Rejected — Lists have no O(1) "update item by id" operation; editing a submission in-place would require `LSET` by index (requires tracking/searching index, race-prone) or reading+rewriting the whole list. Hash gives `HSET`/`HGET` by id directly. |
| Path-specific body-size exception (mirror `/analyze`) | Tighter Pydantic list caps for public submission model | Both viable — tighter caps is recommended as the default because it keeps a single, uniform global body cap (4KB) and doesn't grow the code paths through `_limit_body_size` that need auditing. Only fall back to a path exception if the tightened caps make the form unusably restrictive for legitimate multi-link submissions. |
| Honeypot alone | Honeypot + minimum-time-since-page-load check | D-03 only locks "honeypot invisível + rate limit + validação estrita" — a time-based check is not in scope, but is a zero-dependency addition (compare a timestamp submitted in a hidden field against `time.time()` server-side) the planner may add at discretion since it doesn't require any new library and web sources report it substantially increases the honeypot's block rate when combined [WebSearch, single source — LOW confidence, optional not required]. |

**Installation:**
```bash
# No installation needed — all libraries already in requirements.txt and .venv
```

**Version verification:** Verified directly against the project's own `.venv` rather than the public registry, since this phase adds no new dependency:
```bash
.venv/bin/pip show slowapi limits   # slowapi 0.1.9, limits 5.8.0
.venv/bin/python3 -c "import pydantic; print(pydantic.VERSION)"  # 2.13.3
```

## Architecture Patterns

### System Architecture Diagram

```
[Visitor Browser]                         [Admin Browser — Yonkou]
      |                                            |
      | POST /submissions (JSON)                   | GET /yonkou  (cookie sg_admin)
      | includes honeypot field (must be empty)    |
      v                                            v
+---------------------------+          +--------------------------------+
| slowapi rate limiter      |          | _admin_required_dependency      |
| (3/hour per IP, Redis)    |          | _admin_csrf_dependency (mutate) |
+---------------------------+          +--------------------------------+
      |                                            |
      v                                            v
+-------------------------------+     +---------------------------------------+
| Pydantic SubmissionRequest    |     | GET  /yonkou/submissions   (list)      |
|  - field_validator per field  |     | PATCH /yonkou/submissions/{id} (edit)  |
|  - model_validator: >=1       |     | POST /yonkou/submissions/{id}/promote  |
|    contact field required     |     | POST /yonkou/submissions/{id}/reject   |
|  - honeypot must be empty     |     | POST /yonkou/submissions/{id}/archive  |
+-------------------------------+     +---------------------------------------+
      |  (honeypot filled => fake 202, no persist)          |
      v                                                     v
+----------------------------------------------------------------------+
|  Submission storage: Redis Hash submissions:data (id -> JSON)        |
|                       Redis SortedSet submissions:index (score=ts)   |
|                       JSON fallback .data/submissions.json (dict)    |
|  status field inside each JSON doc: pendente|promovida|rejeitada|    |
|                                       arquivada                      |
+----------------------------------------------------------------------+
      |
      | promote: derive FeaturedReleaseRequest-shaped dict from submission
      v
+----------------------------------------------------------------------+
| featured:next  (Redis string + JSON fallback, same shape as          |
|                 featured:current)                                    |
+----------------------------------------------------------------------+
      |
      | POST /yonkou/releases/publish-next (admin+CSRF, explicit action)
      v
+----------------------------------------------------------------------+
| featured:current  <-- becomes featured:history[0] (existing          |
|                       _append_to_history), replaced by featured:next |
+----------------------------------------------------------------------+
      |
      v
[GET /featured — public, unchanged, existing endpoint reads featured:current]
```

### Recommended Project Structure
No new files/folders — this phase adds functions and routes to the existing modules:
```
api/
├── main.py       # + SubmissionRequest/SubmissionContact models, storage fns, routes
├── config.py     # + submission rate limit + cap settings (via _safe_int, existing pattern)
static/
├── nav.js        # section-participar becomes real form; participarTemplate removed/replaced
├── yonkou.js     # + "Submissões" tab wiring (list, edit, promote, reject, archive)
├── index.html    # #section-participar replaced with <form>; #section-privacidade updated
├── about.html    # privacy section updated (mirrors index.html #section-privacidade)
tests/
├── test_security.py   # + submission endpoint + admin curation endpoint security tests
├── test_frontend.py   # + form markup / no-flexbox / honeypot-hidden contract tests
.planning/
├── SECURITY-CHECKLIST.md   # + new "Submissões" section, following the "Som da Semana" section pattern
├── REQUIREMENTS.md         # + new v1.4 section with SUBMIT-* / SEC-SUBMIT-* REQ-IDs
```

### Pattern 1: Hash + Sorted Set for mutable, capped, status-tracked records
**What:** Store each submission as a JSON blob in a Redis Hash keyed by submission id; maintain insertion order and enable cap eviction via a parallel Sorted Set (score = creation epoch, member = id).
**When to use:** Any time records need independent mutation (edit, status transition) AND a bounded/ordered collection — exactly this phase's requirement, distinct from the append-only `featured:history`/`updates:history` Lists already in the codebase.
**Example:**
```python
# New constants, same style as existing FEATURED_HISTORY_KEY/MAX
SUBMISSIONS_DATA_KEY = "submissions:data"     # Hash: id -> JSON
SUBMISSIONS_INDEX_KEY = "submissions:index"   # SortedSet: score=created_at, member=id
SUBMISSIONS_CAP = settings.submissions_cap    # default 200, via _safe_int like other caps

def _save_submission(doc: dict) -> None:
    raw = json.dumps(doc, ensure_ascii=False)
    try:
        _redis.hset(SUBMISSIONS_DATA_KEY, doc["id"], raw)
        _redis.zadd(SUBMISSIONS_INDEX_KEY, {doc["id"]: doc["created_at_epoch"]})
        _enforce_submissions_cap()
    except (redis_lib.exceptions.ConnectionError, redis_lib.exceptions.TimeoutError):
        pass
    _write_submissions_fallback()  # re-reads Redis-or-fallback merged view, writes dict-shaped JSON

def _enforce_submissions_cap() -> None:
    total = _redis.zcard(SUBMISSIONS_INDEX_KEY)
    if total <= SUBMISSIONS_CAP:
        return
    # Oldest first; only evict terminal states (D-02) — never silently
    # delete Pendente/Promovida records just because the queue is long.
    oldest_ids = _redis.zrange(SUBMISSIONS_INDEX_KEY, 0, total - SUBMISSIONS_CAP - 1 + 50)
    evicted = 0
    for sid in oldest_ids:
        if evicted >= (total - SUBMISSIONS_CAP):
            break
        raw = _redis.hget(SUBMISSIONS_DATA_KEY, sid)
        if not raw:
            continue
        doc = json.loads(raw)
        if doc.get("status") in ("rejeitada", "arquivada"):
            _redis.hdel(SUBMISSIONS_DATA_KEY, sid)
            _redis.zrem(SUBMISSIONS_INDEX_KEY, sid)
            evicted += 1
```

### Pattern 2: Public write endpoint mirrors `/analyze` (rate limit + strict validation + no auth)
**What:** `POST /submissions`, decorated with `@limiter.limit(f"{settings.submission_rate_limit_per_hour}/hour")`, signature `(request: Request, request_body: SubmissionRequest, response: Response)`.
**When to use:** Any new public-write endpoint in this codebase — this is the established Security Gate template (see `submit_job`/`submit_analyze` in `api/main.py`).
**Example:**
```python
# Source: api/main.py:1109-1120 (submit_job) — same shape, new rate limit key
@app.post("/submissions", status_code=202)
@limiter.limit(f"{settings.submission_rate_limit_per_hour}/hour")
def submit_submission(request: Request, request_body: SubmissionRequest, response: Response) -> dict:
    if request_body.honeypot.strip():
        # Do not reveal detection to the caller — fake success, no persistence.
        return {"status": "recebido"}
    doc = _submission_document(request_body)
    _save_submission(doc)
    return {"status": "recebido"}
```

### Pattern 3: Admin CRUD mirrors `/yonkou/releases` (GET=auth-only, POST/PATCH=auth+CSRF)
**What:** Reads use `dependencies=[Depends(_admin_required_dependency)]`; mutations use `dependencies=[Depends(_admin_csrf_dependency)]`.
**When to use:** Every admin curation endpoint for submissions (list/edit/promote/reject/archive).
**Example:**
```python
# Source: api/main.py:1373-1413 (post_release/patch_release/get_releases) — same split
@app.get("/yonkou/submissions", dependencies=[Depends(_admin_required_dependency)])
@limiter.limit("30/minute")
def list_submissions(request: Request, response: Response):
    ...

@app.patch("/yonkou/submissions/{submission_id}", dependencies=[Depends(_admin_csrf_dependency)])
@limiter.limit("20/minute")
def edit_submission(submission_id: str, request: Request, request_body: SubmissionEditRequest, response: Response):
    ...

@app.post("/yonkou/submissions/{submission_id}/promote", dependencies=[Depends(_admin_csrf_dependency)])
@limiter.limit("20/minute")
def promote_submission(submission_id: str, request: Request, response: Response):
    # Derive FeaturedReleaseRequest-shaped payload, write to featured:next (D-06/D-07)
    ...
```

### Pattern 4: Cross-field "at least one of" validation with `model_validator`
**What:** `field_validator` validates each contact field's format/length independently; `model_validator(mode="after")` enforces D-08's "pelo menos um obrigatório" rule across the whole `SubmissionContact` sub-model.
**When to use:** Whenever a rule spans multiple fields — this codebase has no prior example of `model_validator`, only `field_validator`; this is the one genuinely new Pydantic pattern this phase introduces.
**Example:**
```python
# Source: Pydantic v2 docs pattern [WebSearch, cross-verified against installed pydantic 2.13.3
# which supports model_validator(mode="after") — confirmed via local import]
from pydantic import BaseModel, field_validator, model_validator

class SubmissionContact(BaseModel):
    instagram: str = ""
    telefone: str = ""
    email: str = ""

    @field_validator("instagram", "telefone", "email")
    @classmethod
    def strip_and_cap(cls, value: str) -> str:
        value = value.strip()
        if len(value) > 150:
            raise ValueError("Campo de contato deve ter no máximo 150 caracteres")
        return value

    @model_validator(mode="after")
    def at_least_one_contact(self) -> "SubmissionContact":
        if not (self.instagram or self.telefone or self.email):
            raise ValueError("Informe pelo menos um contato: Instagram, telefone ou email")
        return self
```

### Anti-Patterns to Avoid
- **Reusing `featured:history`'s List pattern for submissions:** Lists cannot be edited by id without O(N) rewrite or fragile index tracking. Use Hash+SortedSet (Pattern 1).
- **Naming the honeypot field `honeypot`, `spam_trap`, `nao_preencha`, etc.:** Advanced bots skip fields whose name/label signals a trap [WebSearch, cross-referenced across 5+ sources]. Name it something a real form plausibly has (e.g. `website`, `confirmar_email_2`) and hide with off-canvas CSS positioning, not `display:none` alone.
- **Revealing to the submitter that a honeypot was tripped:** Returning a distinct error (e.g. "spam detected") teaches bots which field to leave empty next time. Always return the same success response as a legitimate submission (see Pattern 2).
- **Publishing immediately on "Promover":** D-06 explicitly requires a two-step promote (stage to `featured:next`) then publish (explicit action moves `featured:next`→`featured:current`). Do not collapse these into one endpoint.
- **Exposing contact fields (`SubmissionContact`) via any public-facing endpoint or response body:** D-08 requires contact data admin-only. The public `POST /submissions` response must not echo back the submitted contact data; it should return only a generic `{"status": "recebido"}`.
- **Growing `_MAX_BODY_BYTES` globally to accommodate the new form:** This weakens the body-size defense for every other endpoint. If a route needs more room, add a route-specific check like the existing `/analyze` exception in `_limit_body_size`, with an explicit justification comment — do not raise the shared constant.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bot/spam filtering on a public form | A custom scoring/ML spam classifier | Honeypot field + rate limit + strict Pydantic validation (D-03) | Locked decision — no captcha, no ML; the existing rate-limit+validation stack is proven in this codebase for `/jobs` and `/analyze` |
| CSRF protection for admin mutation endpoints | A new token scheme | `_admin_csrf_dependency` (existing) | Already implemented, tested (`test_yonkou_mutation_requires_csrf_token`), and battle-tested since Phase 11 |
| Admin session auth | New login/session logic | `_admin_required_dependency`/`_require_admin`/signed cookie via `itsdangerous` (existing) | Same reasoning — reuse, do not reimplement signed-cookie auth |
| "At least one of N fields required" validation | Manual `if not (a or b or c): raise HTTPException(...)` inside the route body | Pydantic `model_validator(mode="after")` on `SubmissionContact` | Keeps validation declarative and colocated with the model (matches existing `field_validator` convention), and produces the same unified `{error, error_type}` 422 shape via the existing `_validation_exception_handler` |
| Cap/retention logic for a growing collection | A cron job or separate cleanup script | Inline cap-check on every write (`_enforce_submissions_cap`), same synchronous style as `_append_to_history`'s `LTRIM` | No new scheduled task infrastructure exists in this project (only the WAV sweeper daemon thread, which is a different concern); keep the eviction logic colocated with the write path like `featured:history` already does |

**Key insight:** Every "Don't Hand-Roll" item in this phase already has a working implementation elsewhere in `api/main.py`. The risk is not "picking the wrong library" (there is none to pick) — it's **inconsistency**: implementing submissions storage, auth, or validation in a subtly different style than the existing `featured`/`updates` code, which would make the codebase harder to maintain. Grep `api/main.py` for the existing `_append_to_history`/`_admin_csrf_dependency`/`field_validator` patterns before writing new code, and match them exactly.

## Common Pitfalls

### Pitfall 1: Redis List pattern breaks in-place editing
**What goes wrong:** Copying `_append_to_history`'s `LPUSH`/`LTRIM` approach for submissions, then discovering there's no clean way to `PATCH` a single submission by id.
**Why it happens:** `featured:history` and `updates:history` are the only two existing "collection" examples in the codebase, and both are append-only logs — a natural (but wrong) template to copy for a mutable resource.
**How to avoid:** Use Hash (mutable, keyed by id) + Sorted Set (ordering) instead, as in Architecture Pattern 1.
**Warning signs:** Any code attempting `LSET` by searching for an item's index in a Python loop, or reading/decoding/re-encoding the entire list on every edit.

### Pitfall 2: 4KB global body limit silently rejects legitimate submissions
**What goes wrong:** A submission with 1 artist + 1 producer + 2 links + descrição + contato easily exceeds 4KB once `FeaturedArtist`/`FeaturedLink` nested models (up to 500-char URL fields) are reused as-is, causing real users to get opaque 413s.
**Why it happens:** `_MAX_BODY_BYTES = 4 * 1024` in `api/main.py` is a blanket middleware check that runs before Pydantic validation, and currently has exactly one hardcoded path exception (`/analyze`). A worst-case computation with the reused models: `artistas` (up to 10 × ~700B) + `produtores` (up to 10 × ~700B) + `links` (4 × ~540B) + text fields (3 × 500B) + contact fields ≈ well over 4KB even at moderate, realistic fill rates.
**How to avoid:** Tighten the public-facing `SubmissionRequest` model's list caps (e.g., max 3 artistas, max 2 produtores — this is a public submission form, not the admin's own release editor which legitimately supports up to 10) so realistic payloads stay under 4KB. Only if this proves too restrictive, add a second explicit path exception to `_limit_body_size` (mirroring `/analyze`) with a code comment justifying the new limit per the Security Gate's "justificar e aumentar `_MAX_BODY_BYTES`" requirement.
**Warning signs:** 413 errors during manual testing of the new form with realistic (not minimal) data; Pydantic validation never even running because the middleware rejects first.

### Pitfall 3: Honeypot naming/hiding defeats itself
**What goes wrong:** Naming the field `honeypot` or hiding it with only `display:none` — both are known bot-detection evasion signals; sophisticated spam bots specifically check for these patterns and skip the field, making the trap ineffective against exactly the automated traffic it's meant to catch [WebSearch, cross-referenced across multiple independent how-to sources — MEDIUM confidence].
**Why it happens:** "Just add a hidden field" undersells how much bot tooling specifically targets naive honeypot implementations.
**How to avoid:** Name the field plausibly (e.g. `website`, a field a legitimate contact form might have), position off-canvas via CSS (`position:absolute;left:-9999px`) rather than `display:none` alone, and add `tabindex="-1" aria-hidden="true" autocomplete="off"` for both bot-resistance and accessibility (screen readers won't announce it to real users).
**Warning signs:** None visible until spam volume is measured post-launch — this is a soft pitfall to design correctly up front since there's no automated test that proves a honeypot "works" against real bots.

### Pitfall 4: Cap eviction accidentally deletes non-terminal submissions
**What goes wrong:** A naive `ZREMRANGEBYRANK submissions:index 0 N` (evict oldest N unconditionally) run to enforce the ~200 cap would delete a legitimately Pendente or Promovida submission just because it's old, contradicting D-02 ("Rejeitadas/arquivadas antigas caem fora do cap" — not just "oldest").
**Why it happens:** Simple cap enforcement (like `featured:history`'s `LTRIM`) trims blindly by position, which is correct for an append-only log of already-published items but wrong for a moderation queue with active/pending items mixed in with old rejected ones.
**How to avoid:** Filter by `status` before evicting (see `_enforce_submissions_cap` in Pattern 1) — only remove entries whose status is `rejeitada` or `arquivada`. If the cap is exceeded entirely by non-terminal (Pendente/Promovida) submissions, allow soft overflow rather than force-deleting active queue items; this is an edge case only reachable with a genuine moderation backlog.
**Warning signs:** A submission the operator is actively reviewing "disappearing" from the admin list.

### Pitfall 5: GET/list admin endpoint accidentally exposes contact data client-side beyond the intended audience
**What goes wrong:** Since `GET /yonkou/submissions` is already admin-only (D-08's "visível somente no admin" requirement is satisfied by the auth gate itself), the residual risk is the admin-panel HTML/JS rendering contact data with `innerHTML` instead of `textContent`, opening a stored-XSS vector if a submitter puts a `<script>` payload in, say, the `email` or `descricao` field.
**Why it happens:** The existing Yonkou panel (`_operator_panel_html`) already uses `escape()` consistently for server-rendered HTML and the existing `SECURITY-CHECKLIST.md` SEC-FEATURED-05 control mandates `textContent` over `innerHTML` for JS-rendered content — but that control was written for the featured sidebar (public-facing), and a reviewer might assume admin-only surfaces don't need the same discipline.
**How to avoid:** Apply the exact same `escape()` (server-rendered) / `textContent` (JS-rendered) discipline to the new submissions admin tab, even though it's authenticated — defense in depth against a submitter who submits an XSS payload that later executes in the *operator's* authenticated browser session (which holds the CSRF token and admin cookie — a much higher-value target than the public site).
**Warning signs:** Any new admin-tab code path using `innerHTML =` or raw string interpolation into HTML without `escape()`.

## Code Examples

Verified/derived patterns from this codebase:

### Submission Pydantic model reusing existing nested models
```python
# Source: api/main.py:195-234 (FeaturedReleaseRequest) — same validator style, new model
class SubmissionRequest(BaseModel):
    artistas: list[FeaturedArtist]
    produtores: list[FeaturedArtist] = []
    titulo: str
    genero: str
    youtube_url: str
    descricao: str
    links: list[FeaturedLink] = []
    contato: SubmissionContact
    honeypot: str = ""  # D-03 — must stay empty; do not name this field "honeypot" in HTML

    @field_validator("titulo", "genero", "descricao")
    @classmethod
    def text_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Campo obrigatório")
        if len(value) > 500:
            raise ValueError("Campo deve ter no máximo 500 caracteres")
        return value

    @field_validator("youtube_url")
    @classmethod
    def youtube_url_required(cls, v: str) -> str:
        # D-11: link do YouTube é obrigatório — reuse JobRequest.must_be_youtube
        # validator logic (normalizes to https://www.youtube.com/watch?v=ID)
        ...

    @field_validator("artistas")
    @classmethod
    def artistas_capped_for_public_form(cls, value: list) -> list:
        if not value:
            raise ValueError("Informe ao menos um artista")
        if len(value) > 3:  # tighter than FeaturedReleaseRequest's 10 (Pitfall 2)
            raise ValueError("No máximo 3 artistas por envio")
        return value
```

### State machine transition (promote)
```python
# Derives FeaturedReleaseRequest-shaped dict; does NOT mutate the submission's
# own record contents (D-07 — submission is the source, featured is derived).
def _promote_submission(submission: dict) -> dict:
    featured_payload = {
        "artistas": submission["artistas"],
        "produtores": submission["produtores"],
        "titulo": submission["titulo"],
        "genero": submission["genero"],
        "descricao": submission["descricao"],
        "links": submission["links"],
    }
    request_body = FeaturedReleaseRequest(**featured_payload)  # reuse existing validation
    doc = _featured_document(request_body)  # existing helper, api/main.py:553
    doc["source_submission_id"] = submission["id"]  # traceability, discretion item
    return doc
```

## State of the Art

Not applicable in the "library version drift" sense — this phase uses only already-pinned, already-verified project dependencies. The one relevant "state of the art" note:

| Old Approach (this codebase, until Phase 16) | Current Approach (Phase 16) | When Changed | Impact |
|--------------------------------------------|------------------------------|---------------|--------|
| Email-based submission (`mailto:` + copyable template in `nav.js`) | In-app form → `POST /submissions` → admin curation queue | Phase 16 | Removes `participarTemplate`/`copy-template-btn` from `nav.js`; `#section-participar` in `index.html` becomes a real `<form>`; introduces the first genuinely public-write, unauthenticated *content-submission* endpoint (distinct from `/jobs` and `/analyze`, which are functional/utility endpoints, not editorial content) |

**Deprecated/outdated:**
- `participarTemplate` array and `copy-template-btn`/`copy-template-status` in `static/nav.js` (lines 80-147) — to be removed once the real form replaces the copy-to-clipboard flow.
- The "Mande tudo por e-mail..." copy in `static/index.html` `#section-participar` (lines 300-305) — to be replaced with the form and its success-message flow (D-10).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended Redis key names (`submissions:data`, `submissions:index`) — CONTEXT.md explicitly leaves this to planner/executor discretion, so these are proposed defaults, not a locked decision | Architecture Pattern 1 | Low — purely internal naming, no behavior risk if planner picks different names |
| A2 | Tightened list caps for the public submission form (max 3 artistas, max 2 produtores) as the primary fix for the body-size pitfall, rather than a path-specific `_MAX_BODY_BYTES` exception | Pitfall 2, Alternatives Considered | Medium — if the underground music scene commonly submits collabs with 4+ credited artists, tightening to 3 could reject legitimate submissions; planner should verify against D-11's inherited template (which implies single artist/producer as the common case) or make the cap configurable |
| A3 | Honeypot field naming/hiding recommendations (plausible name, off-canvas CSS, `tabindex="-1"`, `aria-hidden`, `autocomplete="off"`) are industry-common patterns, not verified against this specific codebase or a primary security standard (OWASP does not prescribe a specific honeypot implementation) | Common Pitfalls #3, Anti-Patterns | Low — a less-optimal honeypot still functions as one signal among three (rate limit + validation are the other two per D-03); worst case is somewhat higher spam-through rate, not a security hole |
| A4 | Optional time-based ("too fast to be human") check as a discretionary addition alongside the honeypot | Alternatives Considered | Low — explicitly optional, not a locked requirement; omitting it changes nothing about D-03 compliance |
| A5 | Proposed new REQ-ID category names `SUBMIT-*` (functional) and `SEC-SUBMIT-*` (security) for the new v1.4 REQUIREMENTS.md section — no existing convention in REQUIREMENTS.md covers submission/curation features, so this is a new category name choice | Phase Requirements section below | Low — cosmetic; easy to rename before REQUIREMENTS.md is finalized if planner prefers different prefixes |
| A6 | `featured:next` derived document carries a `source_submission_id` field for traceability back to the originating submission | Code Examples (promote) | Low — convenience field, not required by any locked decision; omitting it just loses an audit trail |

## Open Questions

1. **Should editing a submission after it has been promoted (staged to `featured:next`) automatically re-derive `featured:next`, or does the operator have to re-promote?**
   - What we know: D-07 says editing changes the submission in-place, and promoting derives a featured document. Nothing in CONTEXT.md specifies whether these two are meant to stay in sync after the fact.
   - What's unclear: If an operator edits a submission's `descricao` after already promoting it, does `featured:next` silently go stale (showing the old text when published), or does the edit action need to detect "this submission is currently the promoted one" and re-derive?
   - Recommendation: Simplest correct behavior — re-derive `featured:next` from the submission's current fields every time `/promote` is called (idempotent), and treat "edit" as always only touching the submission record. Document that if an operator edits *after* promoting, they must re-click "Promover" before publishing, or the plan should make the edit endpoint auto-refresh `featured:next` when the edited submission's status is already `promovida`. Flag this for the planner to pick one and encode it as a task-level decision.

2. **Format validation strictness for `instagram`/`telefone`/`email` contact fields.**
   - What we know: D-08 requires the fields to exist and at-least-one-required, but CONTEXT.md's "Claude's Discretion" section does not mention contact format validation at all.
   - What's unclear: Whether `email` should be validated as RFC-5322-ish (e.g., simple `@` + domain check) or accepted as free text; whether `telefone` needs a Brazilian phone number pattern; whether `instagram` should be normalized (strip a leading `@` or require one).
   - Recommendation: Light-touch validation only (length caps + trim, as shown in Code Examples) — these are contact-request fields for a human operator to read and reach out manually, not fields feeding an automated notification system, so strict format enforcement adds friction without adding safety. If the operator later reports garbage data, format validation can be tightened in a follow-up.

## Environment Availability

No external dependencies beyond what's already running in this project's dev/prod environment (Redis, the existing FastAPI/Celery stack). No new services, CLIs, or runtimes are introduced by this phase.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | Submission storage (Hash+SortedSet) | ✓ (already required by the whole app) | per `REDIS_URL` | JSON fallback file, same pattern as `featured`/`updates` |
| Python packages (fastapi, pydantic, slowapi, redis-py, itsdangerous) | All new code | ✓ | see Standard Stack table | none needed — already installed |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — this phase adds no new external dependency at all.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (per `pytest.ini`) |
| Config file | `pytest.ini` — `testpaths = tests`, markers `integration`/`e2e` |
| Quick run command | `pytest tests/test_security.py -x -q` |
| Full suite command | `pytest tests/ -v -m "not e2e and not integration"` |

### Phase Requirements → Test Map
| Req ID (proposed) | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUBMIT-01 | Public form submits to `POST /submissions`, gets generic success response | unit | `pytest tests/test_security.py::test_post_submission_returns_success -x` | ❌ Wave 0 |
| SUBMIT-02 | Submission validates required fields (artista, titulo, genero, youtube_url, descricao) via Pydantic | unit | `pytest tests/test_security.py::test_post_submission_validates_required_fields -x` | ❌ Wave 0 |
| SUBMIT-03 | At-least-one-contact rule (D-08) enforced by `model_validator` | unit | `pytest tests/test_security.py::test_post_submission_requires_one_contact -x` | ❌ Wave 0 |
| SUBMIT-04 | Admin lists all submissions with statuses | unit | `pytest tests/test_security.py::test_get_submissions_requires_admin -x` | ❌ Wave 0 |
| SUBMIT-05 | Admin edits a submission in-place (`PATCH`) | unit | `pytest tests/test_security.py::test_patch_submission_requires_csrf -x` | ❌ Wave 0 |
| SUBMIT-06 | Admin promotes a submission → writes `featured:next` (D-06/D-07) | unit | `pytest tests/test_security.py::test_promote_submission_writes_featured_next -x` | ❌ Wave 0 |
| SUBMIT-07 | Admin publishes `featured:next` → `featured:current`, old current → history | unit | `pytest tests/test_security.py::test_publish_next_moves_current_to_history -x` | ❌ Wave 0 |
| SUBMIT-08 | Admin rejects/archives a submission (status transition) | unit | `pytest tests/test_security.py::test_reject_and_archive_submission -x` | ❌ Wave 0 |
| SUBMIT-09 | Cap eviction removes only rejected/archived oldest entries (D-02) | unit | `pytest tests/test_security.py::test_submissions_cap_evicts_terminal_only -x` | ❌ Wave 0 |
| SEC-SUBMIT-01 | `POST /submissions` rate limited (~3/hour per IP, D-04) | unit | `pytest tests/test_security.py::test_submission_rate_limit -x` | ❌ Wave 0 |
| SEC-SUBMIT-02 | Honeypot field filled → silent fake-success, no persistence | unit | `pytest tests/test_security.py::test_submission_honeypot_silently_dropped -x` | ❌ Wave 0 |
| SEC-SUBMIT-03 | All admin submission mutation endpoints require CSRF | unit | `pytest tests/test_security.py::test_submission_admin_mutations_require_csrf -x` | ❌ Wave 0 |
| SEC-SUBMIT-04 | `POST /submissions` body size enforced (tightened caps or dedicated limit) | unit | `pytest tests/test_security.py::test_submission_body_size_enforced -x` | ❌ Wave 0 |
| SEC-SUBMIT-05 | Contact fields never appear in the public `/submissions` response or any unauthenticated endpoint | unit | `pytest tests/test_security.py::test_submission_response_excludes_contact -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_security.py -x -q`
- **Per wave merge:** `pytest tests/ -v -m "not e2e and not integration"`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus `pytest tests/test_security.py` explicitly green per CLAUDE.md's "Security Gate" hard requirement before any commit to main.

### Wave 0 Gaps
- [ ] All test IDs listed above are new — no existing test file covers submissions. They should be added to `tests/test_security.py` following the exact fixture/style already used for `test_post_featured_*`/`test_yonkou_updates_*`.
- [ ] `tests/test_frontend.py` — add contract tests for the new form markup (table-based layout per VISUAL-04, honeypot field present and hidden via CSS not `display:none`, no `<script>`-visible honeypot name) and the new Yonkou "Submissões" tab, mirroring `test_yonkou_updates_form_is_hidden_behind_button`.
- [ ] No new pytest fixtures or framework install needed — `api_client` fixture in `tests/conftest.py` already provides `fakeredis` + `MemoryStorage` rate-limit isolation that will work unchanged for the new Hash/SortedSet keys and new rate-limited routes.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes (admin curation only) | Existing signed-cookie session (`itsdangerous`, `ADMIN_COOKIE_NAME`) — unchanged, reused |
| V3 Session Management | yes (admin curation only) | Existing `HttpOnly`/`SameSite=strict`/signed, time-limited cookie — unchanged, reused |
| V4 Access Control | yes | `_admin_required_dependency` (read) / `_admin_csrf_dependency` (mutate) on every new admin route; public `POST /submissions` intentionally has no auth (by design — it's the public intake point) but is rate-limited |
| V5 Input Validation | yes | Pydantic `field_validator` (per-field) + `model_validator` (cross-field, at-least-one-contact) on `SubmissionRequest`/`SubmissionContact`; global `_limit_body_size` middleware (with the Pitfall 2 caveat) |
| V6 Cryptography | no | No new cryptographic material — CSRF/session signing already exists and is reused unchanged |
| V7 Error Handling / Logging | yes | Existing `_validation_exception_handler` (422 → unified `{error, error_type}`) applies automatically to new Pydantic models; honeypot rejection must NOT log/return a distinguishable error (Anti-Pattern) |
| V13 API and Web Service | yes | New endpoints follow existing REST conventions (`POST /submissions`, `GET/PATCH /yonkou/submissions/{id}`, `POST /yonkou/submissions/{id}/{action}`) |

### Known Threat Patterns for FastAPI + Redis + public write endpoint

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Automated spam submission flooding the moderation queue | Denial of Service / Repudiation | Rate limit (3/hour/IP, D-04) + honeypot (D-03) + strict Pydantic validation — layered, no single point of failure |
| Stored XSS via submission fields rendered in the admin panel | Tampering / Elevation of Privilege | `escape()` on server-rendered HTML, `textContent` (never `innerHTML`) on JS-rendered admin UI — see Pitfall 5 |
| CSRF on admin mutation endpoints (edit/promote/reject/archive) | Spoofing / Tampering | `_admin_csrf_dependency` (existing) on every mutating route, exactly like `/yonkou/releases` |
| Body-size-based memory exhaustion via oversized submission payload | Denial of Service | Global `_limit_body_size` (4KB) + Pydantic list-length caps (Pitfall 2) — reject before parsing large text into Python objects |
| Path traversal / arbitrary submission ID access (`GET/PATCH /yonkou/submissions/{id}`) | Tampering / Information Disclosure | Validate `submission_id` format (reuse `JOB_ID_PATTERN`-style regex or plain UUID check) before Redis lookup; already-established pattern in `download_file`/`get_job` (`JOB_ID_PATTERN.match`) |
| Information disclosure of submitter contact data to unauthenticated users | Information Disclosure | No public read endpoint for submissions at all — only `POST /submissions` (write, no echo of contact data in response) and admin-only `GET /yonkou/submissions` (Section V4 above) |

## Sources

### Primary (HIGH confidence)
- `api/main.py` (this repo) — `FeaturedReleaseRequest`, `SystemUpdateRequest`, `_admin_required_dependency`/`_admin_csrf_dependency`, `_write_json_private`, `_append_to_history`/`_get_history`, `/analyze` endpoint, `_limit_body_size` middleware — read directly, lines cited throughout
- `api/config.py` (this repo) — `_safe_int` pattern for configurable rate limits/caps
- `static/nav.js`, `static/yonkou.js`, `static/index.html`, `static/about.html` (this repo) — existing form/tab/nav conventions, read directly
- `.planning/SECURITY-CHECKLIST.md`, `CLAUDE.md` § Security Gate (this repo) — mandatory controls, read directly
- Local `.venv` verification — `pydantic.VERSION == 2.13.3`, `pip show slowapi limits` (`0.1.9`/`5.8.0`), `from limits import parse; parse("3/hour")` resolves correctly

### Secondary (MEDIUM confidence)
- [Pydantic model_validator cross-field pattern](https://towardsdatascience.com/validations-in-pydantic-v2-15bcbb39a98b/) — cross-verified against local pydantic 2.13.3 install and multiple other search results agreeing on `model_validator(mode="after")` semantics
- [CSS-Tricks — Building a Honeypot Field That Works](https://css-tricks.com/building-a-honeypot-field-that-works/) and [Reform — Honeypot Field Setup Checklist](https://www.reform.app/blog/honeypot-field-setup-checklist) — honeypot naming/hiding/accessibility best practices, cross-referenced across multiple independent sources agreeing on the same recommendations (avoid `display:none` alone, avoid giveaway names, use `tabindex="-1"`/`aria-hidden`)

### Tertiary (LOW confidence)
- Time-based ("too fast to submit") honeypot enhancement — mentioned in passing by one source ([Nikolai Lehbrink's blog](https://www.nikolailehbr.ink/blog/prevent-form-spamming-honeypot/)) as boosting effectiveness to "99.5%"; not independently verified, presented as optional/discretionary only, not required for D-03 compliance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every library version verified directly against the project's own `.venv`
- Architecture: HIGH — every pattern (auth, CSRF, rate limit, Redis+JSON fallback, Pydantic validation) has a working precedent read directly from `api/main.py` in this repo; the one new pattern (Hash+SortedSet for mutable capped records, `model_validator` for cross-field validation) is a standard, well-documented technique cross-verified against the installed pydantic version
- Pitfalls: MEDIUM-HIGH — the body-size (Pitfall 2) and Redis-mutability (Pitfall 1) pitfalls are derived directly from reading this codebase's actual constants and existing List-based patterns (HIGH); honeypot naming/hiding advice (Pitfall 3) is WebSearch-sourced and cross-referenced across several independent how-to articles, not a primary security standard (MEDIUM)

**Research date:** 2026-07-21
**Valid until:** No expiry driver — this research depends entirely on already-pinned, already-installed project dependencies and this codebase's own existing patterns, not on external ecosystem currency. Re-verify only if `pydantic`, `fastapi`, or `slowapi` versions are bumped before this phase is planned/executed.
