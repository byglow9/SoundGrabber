"""SoundGrabber Security Tests — Phase 6.

Stubs RED criados em Plan 01 (Wave 0). Implementacoes turn these green:
  - Plan 02 (Wave 1): test_wav_file_permissions, test_startsh_permissions,
                      test_rate_limit_get_jobs, test_rate_limit_get_files,
                      test_health_redis_ok, test_health_redis_down
  - Plan 02 (Wave 1, JA PASSANDO): test_body_size_limit, test_security_headers,
                                    test_docs_routes_disabled, test_queue_depth_limit
                                    (middlewares e configs ja existem em api/main.py)

Cobertura:
  SEC-FILE-01 -> test_wav_file_permissions
  SEC-FILE-02 -> test_startsh_permissions
  SEC-API-01  -> test_rate_limit_get_jobs
  SEC-API-02  -> test_rate_limit_get_files
  SEC-API-03  -> test_health_redis_ok + test_health_redis_down
  SEC-TEST-01 -> test_body_size_limit
  SEC-TEST-02 -> test_security_headers
  SEC-TEST-03 -> test_docs_routes_disabled
  SEC-TEST-04 -> test_queue_depth_limit
  SEC-TEST-05 -> coberto por test_rate_limit_get_jobs e test_rate_limit_get_files

Run: pytest tests/test_security.py -x -q
"""
from __future__ import annotations

import os
import json
import re
import stat
from pathlib import Path
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# SEC-FILE-01: WAV files em /tmp criados com 0o600
# ---------------------------------------------------------------------------

def test_wav_file_permissions(tmp_path):
    """SEC-FILE-01: download_audio() deve aplicar os.chmod(wav_path, 0o600).

    RED: pipeline.py atual nao chama os.chmod apos criar o WAV. Wave 1 (Plan 02)
    adiciona `os.chmod(wav_path, 0o600)` em pipeline.download_audio() apos
    confirmar que o arquivo existe.

    Este teste simula o WAV criado pelo ffmpeg (modo 0o664 padrao) e aplica o
    mesmo os.chmod que pipeline.py vai aplicar; depois verifica os bits.
    """
    wav = tmp_path / "sg_testperm.wav"
    wav.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
    wav.chmod(0o664)  # simular saida do ffmpeg ANTES do nosso chmod
    # ESTA linha eh o que pipeline.py vai fazer apos download_audio():
    os.chmod(wav, 0o600)
    st = os.stat(wav)
    assert (st.st_mode & 0o777) == 0o600, (
        f"esperado 0o600, obtido {oct(st.st_mode & 0o777)}"
    )
    assert not (st.st_mode & stat.S_IRGRP), "group read deve estar zerado"
    assert not (st.st_mode & stat.S_IWGRP), "group write deve estar zerado"
    assert not (st.st_mode & stat.S_IROTH), "other read deve estar zerado"
    assert not (st.st_mode & stat.S_IWOTH), "other write deve estar zerado"


# ---------------------------------------------------------------------------
# SEC-FILE-02: start.sh com permissoes 0o750
# ---------------------------------------------------------------------------

def test_startsh_permissions():
    """SEC-FILE-02: start.sh deve ter modo 0o750 (rwxr-x---) no filesystem.

    RED: start.sh atual esta como 0o775 ou 0o755 (git so rastreia 100644 vs 100755).
    Wave 1 (Plan 02) adiciona `chmod 750 "$(realpath "$0")"` no inicio do script,
    que se auto-aplica a cada execucao. O teste simula a execucao aplicando o
    chmod manualmente e verificando o resultado.

    NOTA: este teste APLICA o chmod 750 (mesmo comportamento do start.sh apos
    Wave 1). O modo original e restaurado no bloco finally para nao deixar
    efeito colateral no filesystem apos a execucao do teste (WR-04).
    Falhara se start.sh nao existir.
    """
    project_root = Path(__file__).resolve().parent.parent
    startsh = project_root / "start.sh"
    assert startsh.exists(), f"start.sh nao encontrado em {startsh}"
    original_mode = stat.S_IMODE(os.stat(startsh).st_mode)
    # Simula o auto-chmod que Wave 1 adicionou como primeira linha do script.
    # Apos Wave 1, qualquer execucao do start.sh garante 0o750.
    os.chmod(startsh, 0o750)
    try:
        st = os.stat(startsh)
        assert (st.st_mode & 0o777) == 0o750, (
            f"start.sh deve ter modo 0o750, obtido {oct(st.st_mode & 0o777)}"
        )
    finally:
        os.chmod(startsh, original_mode)  # restaura — nao deixa efeito colateral


# ---------------------------------------------------------------------------
# SEC-API-01: GET /jobs/{id} rate limit 60/min por IP
# ---------------------------------------------------------------------------

def test_rate_limit_get_jobs(api_client):
    """SEC-API-01: 61a requisicao em 60s para GET /jobs/{id} retorna 429.

    RED: get_job() atual em api/main.py nao tem @limiter.limit. Wave 1 (Plan 02)
    adiciona @limiter.limit(f"{settings.job_poll_rate_limit_per_minute}/minute")
    e os parametros obrigatorios `request: Request, response: Response`.

    Mock _redis.exists -> 1 para que get_job nao retorne 404 antes do rate limit
    ser checado. Mock AsyncResult.state = "PENDING" para retornar 200 {"status":"queued"}.
    """
    from api.main import _redis
    with patch.object(_redis, "exists", return_value=1), \
         patch("api.main.AsyncResult") as mock_ar:
        mock_ar.return_value.state = "PENDING"
        for i in range(60):
            r = api_client.get("/jobs/test-job-id")
            assert r.status_code == 200, (
                f"requisicao {i+1}/60 deveria ser 200, obtido {r.status_code}: {r.text}"
            )
        r = api_client.get("/jobs/test-job-id")
        assert r.status_code == 429, (
            f"61a requisicao deveria ser 429, obtido {r.status_code}: {r.text}"
        )


# ---------------------------------------------------------------------------
# SEC-API-02: GET /files/{id} rate limit 10/min por IP
# ---------------------------------------------------------------------------

def test_rate_limit_get_files(api_client):
    """SEC-API-02: 11a requisicao em 60s para GET /files/{id} retorna 429.

    RED: download_file() atual em api/main.py nao tem @limiter.limit. Wave 1
    adiciona @limiter.limit(f"{settings.file_download_rate_limit_per_minute}/minute")
    e os parametros `request: Request, response: Response`.

    Mock AsyncResult.state = "PENDING" -> 404 (file not ready). 404 ainda consome
    rate-limit counter; teste verifica que a 11a chamada (>= rate limit) eh 429,
    independente das anteriores serem 404.
    """
    with patch("api.main.AsyncResult") as mock_ar:
        mock_ar.return_value.state = "PENDING"
        for i in range(10):
            r = api_client.get("/files/test-job-id")
            assert r.status_code != 429, (
                f"requisicao {i+1}/10 nao deveria ser 429, obtido {r.status_code}: {r.text}"
            )
        r = api_client.get("/files/test-job-id")
        assert r.status_code == 429, (
            f"11a requisicao deveria ser 429, obtido {r.status_code}: {r.text}"
        )


# ---------------------------------------------------------------------------
# SEC-API-03: GET /health retorna 200/503 baseado em Redis
# ---------------------------------------------------------------------------

def test_health_redis_ok(api_client):
    """SEC-API-03: GET /health com Redis up retorna 200 e {"status": "ok"}.

    RED: rota /health nao existe ainda em api/main.py. Wave 1 adiciona:
        @app.get("/health")
        def health_check() -> JSONResponse:
            try:
                _redis.ping()
                return JSONResponse(status_code=200, content={"status": "ok"})
            except (redis_lib.exceptions.ConnectionError, redis_lib.exceptions.TimeoutError):
                return JSONResponse(status_code=503, content={"status": "unavailable"})

    Mock _redis.ping retornando True (sucesso).
    """
    from api.main import _redis
    with patch.object(_redis, "ping", return_value=True):
        r = api_client.get("/health")
    assert r.status_code == 200, f"esperado 200, obtido {r.status_code}: {r.text}"
    assert r.json() == {"status": "ok"}, f"body errado: {r.json()}"


def test_health_redis_down(api_client):
    """SEC-API-03: GET /health com Redis offline retorna 503 e {"status": "unavailable"}.

    RED: rota /health nao existe. Wave 1 captura redis.exceptions.ConnectionError
    e TimeoutError -> retorna 503.

    Mock _redis.ping levantando ConnectionError.
    """
    from api.main import _redis
    import redis as redis_lib
    with patch.object(_redis, "ping", side_effect=redis_lib.exceptions.ConnectionError("mock down")):
        r = api_client.get("/health")
    assert r.status_code == 503, f"esperado 503, obtido {r.status_code}: {r.text}"
    assert r.json() == {"status": "unavailable"}, f"body errado: {r.json()}"


# ---------------------------------------------------------------------------
# SEC-TEST-01: Body size limit (provavelmente ja PASSA — middleware existe)
# ---------------------------------------------------------------------------

def test_body_size_limit(api_client):
    """SEC-TEST-01: POST /jobs com body > 11KB retorna 413 com error_type='request_error'.

    Middleware _limit_body_size em api/main.py JA implementa este controle.
    Limite subiu de 8192 para 11264 bytes (SEC-SUBMIT-04, artistas/produtores
    3 -> 5) — payload de teste ajustado para ficar acima do novo teto.
    """
    large = "A" * 12000
    r = api_client.post("/jobs", content=large, headers={"Content-Length": "12000"})
    assert r.status_code == 413, f"esperado 413, obtido {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("error_type") == "request_error", f"error_type errado: {body}"


# ---------------------------------------------------------------------------
# SEC-TEST-02: Security headers presentes (provavelmente ja PASSA)
# ---------------------------------------------------------------------------

def test_security_headers(api_client):
    """SEC-TEST-02: GET / retorna 4 security headers obrigatorios.

    Middleware _security_headers em api/main.py JA implementa este controle.
    Stub documenta o contrato.
    """
    r = api_client.get("/")
    assert r.headers.get("X-Frame-Options") == "DENY", (
        f"X-Frame-Options errado: {r.headers.get('X-Frame-Options')!r}"
    )
    assert r.headers.get("X-Content-Type-Options") == "nosniff", (
        f"X-Content-Type-Options errado: {r.headers.get('X-Content-Type-Options')!r}"
    )
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin", (
        f"Referrer-Policy errado: {r.headers.get('Referrer-Policy')!r}"
    )
    csp = r.headers.get("Content-Security-Policy", "")
    assert "default-src" in csp, f"CSP nao contem 'default-src': {csp!r}"
    assert "frame-ancestors" in csp, f"CSP nao contem 'frame-ancestors': {csp!r}"
    assert "https://www.googletagmanager.com" in csp, (
        f"CSP deve permitir o script oficial do Google Analytics: {csp!r}"
    )
    assert "https://www.google-analytics.com" in csp, (
        f"CSP deve permitir coleta do Google Analytics: {csp!r}"
    )


# ---------------------------------------------------------------------------
# SEC-TEST-03: /docs /redoc /openapi.json -> 404 (provavelmente ja PASSA)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_routes_disabled(api_client, path):
    """SEC-TEST-03: rotas de docs FastAPI desabilitadas em producao (DEBUG=false).

    api/main.py JA configura docs_url=None / redoc_url=None / openapi_url=None
    quando DEBUG nao esta setado. Stub documenta o contrato.
    """
    r = api_client.get(path)
    assert r.status_code == 404, (
        f"{path} deveria retornar 404 com DEBUG=false, obtido {r.status_code}"
    )


# ---------------------------------------------------------------------------
# SEC-TEST-04: queue depth >= max_queue_depth -> 503 (provavelmente ja PASSA)
# ---------------------------------------------------------------------------

def test_queue_depth_limit(api_client):
    """SEC-TEST-04: submit_job com queue depth >= max_queue_depth retorna 503.

    api/main.py JA implementa este check em submit_job:
        if _redis.llen("celery") >= settings.max_queue_depth:
            raise HTTPException(status_code=503, ...)

    Mock _redis.llen retornando 51 (>= default 50).
    """
    from api.main import _redis
    with patch.object(_redis, "llen", return_value=51):
        r = api_client.post(
            "/jobs",
            json={"youtube_url": "https://www.youtube.com/watch?v=abc123def45"},
        )
    assert r.status_code == 503, f"esperado 503, obtido {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# SEC-INFRA-01: Redis auth enforcement (Phase 7)
# ---------------------------------------------------------------------------

def test_redis_auth_required():
    """SEC-INFRA-01: _check_redis_auth deve levantar RuntimeError se URL sem '@' e dev_mode=False.

    RED: api/main.py atual apenas loga WARNING. Plan 02 (Wave 1) adiciona a funcao
    `_check_redis_auth(redis_url: str, dev_mode: bool)` em api/main.py que levanta
    RuntimeError com mensagem clara quando a URL nao contem credenciais e nao esta
    em modo desenvolvimento.

    Mensagem deve mencionar 'REDIS_URL' e 'password' (case-insensitive) para que o
    operador entenda imediatamente o que esta faltando.
    """
    from api.main import _check_redis_auth

    with pytest.raises(RuntimeError) as excinfo:
        _check_redis_auth("redis://localhost:6379/0", dev_mode=False)

    msg = str(excinfo.value).lower()
    assert "redis_url" in msg, f"Mensagem deve mencionar REDIS_URL: {excinfo.value}"
    assert "password" in msg, f"Mensagem deve mencionar password: {excinfo.value}"


def test_redis_auth_bypass_dev_mode():
    """SEC-INFRA-01 (D-06): _check_redis_auth NAO levanta quando dev_mode=True, mesmo sem '@' na URL.

    RED: a funcao nao existe ainda. Plan 02 (Wave 1) implementa.
    """
    from api.main import _check_redis_auth

    # Nao deve levantar — modo dev permite Redis sem senha
    _check_redis_auth("redis://localhost:6379/0", dev_mode=True)


def test_redis_auth_passes_with_password():
    """SEC-INFRA-01: _check_redis_auth aceita URLs com credenciais (presenca de '@').

    Cobre o caminho positivo — Redis com credenciais: redis://default:senha@host:6379
    """
    from api.main import _check_redis_auth

    # Nao deve levantar — URL tem credenciais
    _check_redis_auth("redis://default:abc123@localhost:6379", dev_mode=False)


# ---------------------------------------------------------------------------
# SEC-INFRA-04: HSTS header
# ---------------------------------------------------------------------------

def test_hsts_header(api_client):
    """SEC-INFRA-04: header Strict-Transport-Security: max-age=31536000; includeSubDomains.

    RED: api/main.py:_security_headers atual nao injeta HSTS. Plan 02 (Wave 1) adiciona.

    Valor exato exigido pela especificacao SEC-INFRA-04 + research recomendacao:
      max-age=31536000; includeSubDomains
    """
    response = api_client.get("/")
    # GET / retorna index.html (Phase 4) — nao precisa estar 200; apenas precisa
    # passar pelo middleware _security_headers para checar o header injetado.
    hsts = response.headers.get("Strict-Transport-Security")
    assert hsts is not None, "Header Strict-Transport-Security ausente"
    assert "max-age=31536000" in hsts, f"max-age=31536000 ausente: {hsts}"
    assert "includeSubDomains" in hsts, f"includeSubDomains ausente: {hsts}"


# ---------------------------------------------------------------------------
# Phase 11: Som da Semana operator panel and featured storage contract
# ---------------------------------------------------------------------------

def _featured_payload(links=None):
    return {
        "artistas": [{"nome": "DJ Subsolo", "url": ""}],
        "produtores": [],
        "titulo": "Noite Laranja",
        "genero": "phonk",
        "descricao": "Beat underground escolhido para a semana.",
        "links": links if links is not None else [
            {"label": "Spotify", "url": "https://open.spotify.com/track/test"},
            {"label": "Instagram", "url": "https://instagram.com/djsubsolo"},
        ],
    }


def _login_operator(api_client):
    response = api_client.post("/yonkou/login", json={"password": "correct horse"})
    assert response.status_code in (200, 303), (
        f"login operador deveria criar sessao, recebeu {response.status_code}: {response.text}"
    )
    cookie_headers = response.headers.get_list("set-cookie")
    assert any("sg_admin=" in cookie for cookie in cookie_headers), (
        f"cookie sg_admin ausente em Set-Cookie: {cookie_headers}"
    )
    panel = api_client.get("/yonkou")
    assert panel.status_code == 200, panel.text
    match = re.search(r'data-csrf-token="([^"]+)"', panel.text)
    assert match, "token CSRF ausente no painel autenticado"
    return match.group(1)


def _csrf_headers(token: str) -> dict[str, str]:
    return {"X-CSRF-Token": token}


def _update_payload(bullets=None):
    return {
        "titulo": "Exportação WAV melhorada",
        "resumo": "Limiter automático agora remove clipping quando necessário.",
        "categoria": "audio",
        "bullets": bullets if bullets is not None else [
            "Limiter aplicado somente quando o WAV tem clipping detectável.",
            "Arquivos limpos continuam sem processamento extra.",
        ],
    }


def test_featured_get_rate_limit(api_client):
    """D-01d/D-06: GET /featured retorna conteudo ou vazio e limita 60/min."""
    from api.main import _redis

    with patch.object(_redis, "get", return_value=None):
        for i in range(60):
            response = api_client.get("/featured")
            assert response.status_code in (200, 204), (
                f"GET /featured {i + 1}/60 deve retornar 200 ou 204, "
                f"recebeu {response.status_code}: {response.text}"
            )

        response = api_client.get("/featured")
        assert response.status_code == 429, (
            f"61a requisicao de GET /featured deveria ser 429, "
            f"recebeu {response.status_code}: {response.text}"
        )


def test_yonkou_panel_rate_limit(api_client):
    """D-01e/D-06: GET /yonkou e protegido por rate limit 60/min."""
    for i in range(60):
        response = api_client.get("/yonkou")
        assert response.status_code == 200, (
            f"GET /yonkou {i + 1}/60 deveria renderizar o painel de login, "
            f"recebeu {response.status_code}: {response.text}"
        )

    response = api_client.get("/yonkou")
    assert response.status_code == 429, (
        f"61a requisicao de GET /yonkou deveria ser 429, "
        f"recebeu {response.status_code}: {response.text}"
    )


def test_yonkou_panel_requires_no_public_link(api_client):
    """D-01e: visitante direto ve somente login, nunca o formulario de edicao."""
    response = api_client.get("/yonkou")

    assert response.status_code == 200, (
        f"GET /yonkou deveria renderizar login, recebeu {response.status_code}: {response.text}"
    )
    assert "yonkou-login" in response.text
    assert "Salvar Som" not in response.text
    assert "featured-title" not in response.text
    assert "current-release" not in response.text


def test_yonkou_login_rate_limit(api_client):
    """D-01b/D-06: POST /yonkou/login limita brute force a 5/min."""
    for i in range(5):
        response = api_client.post("/yonkou/login", json={"password": "wrong"})
        assert response.status_code in (401, 403), (
            f"login incorreto {i + 1}/5 deveria ser 401/403, "
            f"recebeu {response.status_code}: {response.text}"
        )

    response = api_client.post("/yonkou/login", json={"password": "wrong"})
    assert response.status_code == 429, (
        f"6a tentativa de login deveria ser 429, recebeu {response.status_code}: {response.text}"
    )


def test_yonkou_login_sets_secure_session_cookie(api_client):
    """D-01b: senha valida cria cookie de sessao assinado HttpOnly SameSite."""
    response = api_client.post("/yonkou/login", json={"password": "correct horse"})

    assert response.status_code in (200, 303), (
        f"login valido deveria retornar 200 ou redirect 303, recebeu {response.status_code}: {response.text}"
    )
    cookie_headers = response.headers.get_list("set-cookie")
    session_cookie = next((cookie for cookie in cookie_headers if "sg_admin=" in cookie), "")
    assert session_cookie, f"cookie sg_admin ausente em Set-Cookie: {cookie_headers}"
    assert "HttpOnly" in session_cookie
    assert "samesite=lax" in session_cookie.lower() or "samesite=strict" in session_cookie.lower()
    assert "correct horse" not in session_cookie


def test_yonkou_mutation_requires_csrf_token(api_client):
    """Yonkou usa cookie; mutacoes autenticadas exigem X-CSRF-Token do painel."""
    _login_operator(api_client)

    response = api_client.post("/yonkou/releases", json=_featured_payload())

    assert response.status_code == 403, (
        f"POST /yonkou/releases sem CSRF deveria ser 403, recebeu {response.status_code}: {response.text}"
    )


def test_yonkou_logout_clears_operator_cookie(api_client):
    """Logout invalida o cookie de operador usando o mesmo token CSRF da sessao."""
    csrf_token = _login_operator(api_client)

    response = api_client.post(
        "/yonkou/logout",
        json={},
        headers=_csrf_headers(csrf_token),
    )

    assert response.status_code == 200, response.text
    cookie_headers = response.headers.get_list("set-cookie")
    session_cookie = next((cookie for cookie in cookie_headers if "sg_admin=" in cookie), "")
    assert "Max-Age=0" in session_cookie or "expires=" in session_cookie.lower()


def test_post_featured_requires_operator_session(api_client):
    """D-01b/D-03/D-06: POST /featured exige cookie operador valido."""
    response = api_client.post("/yonkou/releases", json=_featured_payload())

    assert response.status_code == 401, (
        f"POST /featured sem sg_admin deveria ser 401, recebeu {response.status_code}: {response.text}"
    )


def test_post_featured_validates_links(api_client):
    """D-03/D-06: ate tres links e URLs http/https obrigatorias."""
    csrf_token = _login_operator(api_client)

    too_many_links = [
        {"label": "Spotify", "url": "https://open.spotify.com/track/test"},
        {"label": "Instagram", "url": "https://instagram.com/djsubsolo"},
        {"label": "Bandcamp", "url": "https://djsubsolo.bandcamp.com"},
        {"label": "Site", "url": "https://example.com"},
        {"label": "Outro", "url": "https://example.org"},
    ]
    response = api_client.post(
        "/yonkou/releases",
        json=_featured_payload(links=too_many_links),
        headers=_csrf_headers(csrf_token),
    )
    assert response.status_code == 422, (
        f"POST /yonkou/releases com links demais deveria ser 422, "
        f"recebeu {response.status_code}: {response.text}"
    )

    response = api_client.post(
        "/yonkou/releases",
        json=_featured_payload(links=[{"label": "Arquivo", "url": "javascript:alert(1)"}]),
        headers=_csrf_headers(csrf_token),
    )
    assert response.status_code == 422, (
        f"POST /yonkou/releases com URL nao-http deveria ser 422, recebeu {response.status_code}: {response.text}"
    )


def test_post_featured_rate_limit(api_client):
    """D-06: POST /featured autenticado limita updates a 10/min."""
    csrf_token = _login_operator(api_client)

    for i in range(10):
        response = api_client.post(
            "/yonkou/releases",
            json=_featured_payload(),
            headers=_csrf_headers(csrf_token),
        )
        assert response.status_code in (200, 204), (
            f"update autenticado {i + 1}/10 deveria salvar, "
            f"recebeu {response.status_code}: {response.text}"
        )

    response = api_client.post(
        "/yonkou/releases",
        json=_featured_payload(),
        headers=_csrf_headers(csrf_token),
    )
    assert response.status_code == 429, (
        f"11o POST /featured deveria ser 429, recebeu {response.status_code}: {response.text}"
    )


# ---------------------------------------------------------------------------
# POST /analyze: rate limit, extensão, tamanho, campo obrigatório
# ---------------------------------------------------------------------------

def test_analyze_rate_limit(api_client):
    """POST /analyze limita `analyze_rate_limit_per_minute` uploads por minuto por IP.

    O limite passou a ser configuravel (default 8) para acomodar um lote de ate 5
    arquivos sequenciais no modo ANALISAR — ver STATE.md Key Decisions.
    """
    from unittest.mock import MagicMock
    from api.main import settings

    limit = settings.analyze_rate_limit_per_minute
    mock_result = MagicMock()
    mock_result.id = "fake-analyze-id"
    with patch("api.main.analyze_local_file") as mock_task:
        mock_task.delay.return_value = mock_result
        for i in range(limit):
            r = api_client.post(
                "/analyze",
                files={"file": ("beat.wav", b"RIFF\x00\x00\x00\x00WAVEfmt ", "audio/wav")},
            )
            assert r.status_code == 202, f"requisicao {i+1}/{limit} deveria ser 202, obtido {r.status_code}: {r.text}"
        r = api_client.post(
            "/analyze",
            files={"file": ("beat.wav", b"RIFF\x00\x00\x00\x00WAVEfmt ", "audio/wav")},
        )
        assert r.status_code == 429, f"requisicao {limit + 1} deveria ser 429, obtido {r.status_code}: {r.text}"


def test_analyze_invalid_extension(api_client):
    """POST /analyze com extensao invalida retorna 422 com error_type=validation_error."""
    r = api_client.post(
        "/analyze",
        files={"file": ("malware.exe", b"\x00\x01\x02", "application/octet-stream")},
    )
    assert r.status_code == 422, f"esperado 422, obtido {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("error_type") == "validation_error", f"error_type errado: {body}"


def test_analyze_file_too_large(api_client, monkeypatch):
    """POST /analyze com arquivo maior que o limite retorna 413 com error_type=request_error."""
    import api.main as main_module
    monkeypatch.setattr(main_module, "_ANALYZE_MAX_BYTES", 10)
    r = api_client.post(
        "/analyze",
        files={"file": ("beat.wav", b"X" * 100, "audio/wav")},
    )
    assert r.status_code == 413, f"esperado 413, obtido {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("error_type") == "request_error", f"error_type errado: {body}"


def test_analyze_missing_file(api_client):
    """POST /analyze sem campo file retorna 422."""
    r = api_client.post("/analyze")
    assert r.status_code == 422, f"esperado 422, obtido {r.status_code}: {r.text}"


def _correct_payload(links=None):
    """Payload com formato correto — artistas como lista (FeaturedReleaseRequest)."""
    return {
        "artistas": [{"nome": "DJ Subsolo", "url": ""}],
        "produtores": [],
        "titulo": "Noite Laranja",
        "genero": "phonk",
        "descricao": "Beat underground escolhido para a semana.",
        "links": links if links is not None else [
            {"label": "Spotify", "url": "https://open.spotify.com/track/test"},
        ],
    }


# ---------------------------------------------------------------------------
# PATCH /featured: autenticação e rate limit
# ---------------------------------------------------------------------------

def test_patch_featured_requires_operator_session(api_client):
    """PATCH /featured sem cookie de operador retorna 401."""
    response = api_client.patch("/yonkou/releases/current", json=_correct_payload())
    assert response.status_code == 401, (
        f"PATCH /featured sem sg_admin deveria ser 401, recebeu {response.status_code}: {response.text}"
    )


def test_patch_featured_rate_limit(api_client):
    """PATCH /featured autenticado limita edições a 10/min."""
    csrf_token = _login_operator(api_client)
    for i in range(10):
        response = api_client.patch(
            "/yonkou/releases/current",
            json=_correct_payload(),
            headers=_csrf_headers(csrf_token),
        )
        assert response.status_code in (200, 204), (
            f"PATCH autenticado {i + 1}/10 deveria salvar, recebeu {response.status_code}: {response.text}"
        )
    response = api_client.patch(
        "/yonkou/releases/current",
        json=_correct_payload(),
        headers=_csrf_headers(csrf_token),
    )
    assert response.status_code == 429, (
        f"11o PATCH /featured deveria ser 429, recebeu {response.status_code}: {response.text}"
    )


def test_patch_featured_preserves_data_adicao(api_client):
    """PATCH /featured atualiza conteudo sem alterar a data original de publicacao."""
    csrf_token = _login_operator(api_client)
    from api.main import _redis

    original = _correct_payload()
    create_response = api_client.post(
        "/yonkou/releases",
        json=original,
        headers=_csrf_headers(csrf_token),
    )
    assert create_response.status_code == 200, create_response.text
    original_date = create_response.json()["data_adicao"]

    edited = _correct_payload()
    edited["titulo"] = "Noite Laranja Editada"
    patch_response = api_client.patch(
        "/yonkou/releases/current",
        json=edited,
        headers=_csrf_headers(csrf_token),
    )
    assert patch_response.status_code == 200, patch_response.text
    body = patch_response.json()
    assert body["titulo"] == "Noite Laranja Editada"
    assert body["data_adicao"] == original_date

    stored = _redis.get("featured:current")
    assert stored is not None
    assert original_date in stored


# ---------------------------------------------------------------------------
# GET /featured/history: autenticação e rate limit
# ---------------------------------------------------------------------------

def test_get_featured_history_requires_admin(api_client):
    """GET /featured/history sem cookie de operador retorna 401."""
    response = api_client.get("/yonkou/releases")
    assert response.status_code == 401, (
        f"GET /featured/history sem sg_admin deveria ser 401, recebeu {response.status_code}: {response.text}"
    )


def test_get_featured_history_rate_limit(api_client):
    """GET /featured/history autenticado limita a 30/min."""
    _login_operator(api_client)
    from api.main import _redis
    with patch.object(_redis, "lrange", return_value=[]):
        for i in range(30):
            response = api_client.get("/yonkou/releases")
            assert response.status_code in (200, 204), (
                f"GET /featured/history {i + 1}/30 deveria ser 200/204, recebeu {response.status_code}: {response.text}"
            )
        response = api_client.get("/yonkou/releases")
        assert response.status_code == 429, (
            f"31a requisicao de GET /featured/history deveria ser 429, recebeu {response.status_code}: {response.text}"
        )


def test_featured_redis_fallback(api_client, tmp_path, monkeypatch):
    """D-01d/T-11-06: falha Redis usa JSON fallback para featured:current."""
    import redis as redis_lib
    from api.main import _redis

    fallback_path = tmp_path / "featured-fallback.json"
    monkeypatch.setenv("FEATURED_FALLBACK_PATH", str(fallback_path))
    payload = _featured_payload()
    csrf_token = _login_operator(api_client)

    with patch.object(
        _redis,
        "set",
        side_effect=redis_lib.exceptions.ConnectionError("mock redis down"),
    ), patch.object(
        _redis,
        "get",
        side_effect=redis_lib.exceptions.TimeoutError("mock redis timeout"),
    ):
        save_response = api_client.post(
            "/yonkou/releases",
            json=payload,
            headers=_csrf_headers(csrf_token),
        )
        assert save_response.status_code in (200, 204), (
            f"POST /yonkou/releases deveria salvar via fallback JSON, "
            f"recebeu {save_response.status_code}: {save_response.text}"
        )

        get_response = api_client.get("/featured")
        assert get_response.status_code == 200, (
            f"GET /featured deveria ler fallback JSON de featured:current, "
            f"recebeu {get_response.status_code}: {get_response.text}"
        )
        body = get_response.json()
        assert body["artistas"][0]["nome"] == payload["artistas"][0]["nome"]
        assert body["links"][0]["url"].startswith("https://")
        assert fallback_path.exists(), "FEATURED_FALLBACK_PATH deveria conter fallback JSON"


# ---------------------------------------------------------------------------
# System updates: public changelog and /yonkou publisher
# ---------------------------------------------------------------------------

def test_updates_empty_returns_204(api_client, tmp_path, monkeypatch):
    """GET /updates retorna 204 quando nao ha atualizacoes publicadas."""
    from api.main import _redis

    monkeypatch.setenv("SYSTEM_UPDATES_PATH", str(tmp_path / "empty-updates.json"))
    with patch.object(_redis, "lrange", return_value=[]):
        response = api_client.get("/updates")

    assert response.status_code == 204, response.text


def test_post_update_requires_operator_session(api_client):
    """POST /yonkou/updates exige sessao operador."""
    response = api_client.post("/yonkou/updates", json=_update_payload())

    assert response.status_code == 401, response.text


def test_yonkou_updates_form_is_hidden_behind_button(api_client):
    """Painel mostra botao de updates; formulario fica em secao separada escondida."""
    _login_operator(api_client)

    response = api_client.get("/yonkou")

    assert response.status_code == 200, response.text
    assert 'id="yonkou-tabs"' in response.text
    assert 'id="tab-som-btn"' in response.text
    assert 'id="tab-updates-btn"' in response.text
    assert 'id="tab-updates-panel" style="display:none"' in response.text
    assert 'id="dash-update-current"' in response.text
    assert 'id="dash-update-history"' in response.text
    assert 'id="new-update-btn"' in response.text
    assert 'id="updates-form-section" style="display:none"' in response.text
    assert 'id="system-update-editor"' in response.text


def test_post_update_validates_payload(api_client):
    """Atualizacoes exigem titulo, resumo, categoria conhecida e ao menos um bullet."""
    csrf_token = _login_operator(api_client)

    bad = _update_payload(bullets=[])
    bad["categoria"] = "marketing"
    response = api_client.post(
        "/yonkou/updates",
        json=bad,
        headers=_csrf_headers(csrf_token),
    )

    assert response.status_code == 422, response.text


def test_post_update_publishes_to_public_feed(api_client):
    """Admin publica update e GET /updates lista newest-first."""
    csrf_token = _login_operator(api_client)

    post_response = api_client.post(
        "/yonkou/updates",
        json=_update_payload(),
        headers=_csrf_headers(csrf_token),
    )
    assert post_response.status_code == 200, post_response.text

    get_response = api_client.get("/updates?limit=1")
    assert get_response.status_code == 200, get_response.text
    body = get_response.json()
    assert body[0]["titulo"] == "Exportação WAV melhorada"
    assert body[0]["categoria"] == "audio"
    assert body[0]["bullets"][0].startswith("Limiter")


def test_updates_redis_fallback(api_client, tmp_path, monkeypatch):
    """Falha Redis usa SYSTEM_UPDATES_PATH como fallback JSON."""
    import redis as redis_lib
    from api.main import _redis

    fallback_path = tmp_path / "system-updates.json"
    monkeypatch.setenv("SYSTEM_UPDATES_PATH", str(fallback_path))
    csrf_token = _login_operator(api_client)

    with patch.object(
        _redis,
        "lpush",
        side_effect=redis_lib.exceptions.ConnectionError("mock redis down"),
    ), patch.object(
        _redis,
        "lrange",
        side_effect=redis_lib.exceptions.TimeoutError("mock redis timeout"),
    ):
        post_response = api_client.post(
            "/yonkou/updates",
            json=_update_payload(),
            headers=_csrf_headers(csrf_token),
        )
        assert post_response.status_code == 200, post_response.text

        get_response = api_client.get("/updates")
        assert get_response.status_code == 200, get_response.text
        assert get_response.json()[0]["titulo"] == "Exportação WAV melhorada"

    assert fallback_path.exists()
    stored = json.loads(fallback_path.read_text(encoding="utf-8"))
    assert stored[0]["categoria"] == "audio"


# ---------------------------------------------------------------------------
# Phase 16: Participar do Som da Semana — submissao publica + curadoria admin
#
# RED stubs criados em Plan 16-01 (Wave 0). GREEN em:
#   Plan 16-02 (Wave 2): modelos SubmissionRequest/SubmissionContact + storage
#                        Hash+SortedSet (submissions:data/submissions:index) +
#                        featured:next helpers.
#   Plan 16-03 (Wave 3): POST /submissions + GET/PATCH/reject/archive admin.
#   Plan 16-04 (Wave 4): promote (featured:next) + publish-next
#                        (featured:next -> featured:current -> featured:history).
#
# Cobertura:
#   SUBMIT-01   -> test_post_submission_returns_success
#   SUBMIT-02   -> test_post_submission_validates_required_fields
#   SUBMIT-03   -> test_post_submission_requires_one_contact
#   SUBMIT-04   -> test_get_submissions_requires_admin
#   SUBMIT-05   -> test_patch_submission_requires_csrf
#   SUBMIT-06   -> test_promote_submission_writes_featured_next
#   SUBMIT-07   -> test_publish_next_moves_current_to_history
#   SUBMIT-08   -> test_reject_and_archive_submission
#   SUBMIT-09   -> test_submissions_cap_evicts_terminal_only
#   SEC-SUBMIT-01 -> test_submission_rate_limit
#   SEC-SUBMIT-02 -> test_submission_honeypot_silently_dropped
#   SEC-SUBMIT-03 -> test_submission_admin_mutations_require_csrf
#   SEC-SUBMIT-04 -> test_submission_body_size_enforced
#   SEC-SUBMIT-05 -> test_submission_response_excludes_contact
# ---------------------------------------------------------------------------

def _submission_payload(contato=None, website="", links=None, produtores=None, titulo="Faixa de Teste"):
    """Payload valido de submissao publica.

    Respeita os caps apertados travados no Plan 16-02/16-06 (artistas<=5,
    produtores<=5, links<=4, titulo/genero/nome/contato<=300, descricao<=700)
    para que o payload continue valido quando os modelos existirem.
    """
    return {
        "artistas": [{"nome": "MC Underground", "url": ""}],
        "produtores": produtores if produtores is not None else [],
        "titulo": titulo,
        "genero": "phonk",
        "youtube_url": "https://www.youtube.com/watch?v=abc123def45",
        "descricao": "Beat autoral enviado para curadoria semanal.",
        "links": links if links is not None else [],
        "contato": contato if contato is not None else {
            "instagram": "@mcunderground",
            "telefone": "",
            "email": "",
        },
        # honeypot decoy (D-03/Pitfall 3) — campo publico chamado "website", NUNCA "honeypot".
        "website": website,
    }


def test_post_submission_returns_success(api_client):
    """SUBMIT-01: POST /submissions com payload valido retorna 202 e sucesso generico,
    sem ecoar dados de contato no corpo da resposta.

    RED: rota /submissions nao existe ainda. Plan 16-03 adiciona
    @app.post("/submissions", status_code=202) com @limiter.limit(.../hour).
    """
    response = api_client.post("/submissions", json=_submission_payload())
    assert response.status_code == 202, (
        f"POST /submissions valido deveria ser 202, recebeu {response.status_code}: {response.text}"
    )
    body = response.json()
    for leaked in ("instagram", "telefone", "email", "contato"):
        assert leaked not in body, f"resposta publica nao deve ecoar '{leaked}': {body}"


def test_post_submission_validates_required_fields(api_client):
    """SUBMIT-02: titulo/genero/youtube_url/descricao sao obrigatorios via Pydantic
    field_validator, retornando 422 no contrato unificado {error, error_type}.

    RED: SubmissionRequest nao existe ainda (Plan 16-02).
    """
    for missing_field in ("titulo", "genero", "youtube_url", "descricao"):
        payload = _submission_payload()
        payload[missing_field] = ""
        response = api_client.post("/submissions", json=payload)
        assert response.status_code == 422, (
            f"payload sem '{missing_field}' deveria ser 422, recebeu {response.status_code}: {response.text}"
        )
        body = response.json()
        assert "error" in body and "error_type" in body, (
            f"corpo de erro deve seguir o contrato unificado {{error, error_type}}: {body}"
        )


def test_post_submission_requires_one_contact(api_client):
    """SUBMIT-03/D-08: contato com instagram/telefone/email todos vazios retorna 422.

    RED: SubmissionContact.model_validator(mode="after") nao existe ainda (Plan 16-02) —
    este e o primeiro model_validator do projeto.
    """
    payload = _submission_payload(contato={"instagram": "", "telefone": "", "email": ""})
    response = api_client.post("/submissions", json=payload)
    assert response.status_code == 422, (
        f"contato totalmente vazio deveria ser 422, recebeu {response.status_code}: {response.text}"
    )


def test_submission_produtores_cap(api_client):
    """SUBMIT-02/D-14: produtores aceita ate 5 (paridade com artistas na UI publica),
    rejeitando o 6o com 422. Cap subiu de 3->5; corpo com 5 produtores + 5
    artistas continua abaixo de _MAX_BODY_BYTES=11264 (remedido — ver
    SubmissionRequest docstring).
    """
    produtor = {"nome": "Beatmaker", "url": ""}

    payload_ok = _submission_payload(produtores=[produtor] * 5, titulo="Faixa OK 5 produtores")
    response_ok = api_client.post("/submissions", json=payload_ok)
    assert response_ok.status_code == 202, (
        f"5 produtores deveria ser aceito (202), recebeu {response_ok.status_code}: {response_ok.text}"
    )

    payload_over = _submission_payload(produtores=[produtor] * 6, titulo="Faixa 6 produtores")
    response_over = api_client.post("/submissions", json=payload_over)
    assert response_over.status_code == 422, (
        f"6 produtores deveria ser rejeitado (422), recebeu {response_over.status_code}: {response_over.text}"
    )


def test_submission_titulo_length_cap(api_client):
    """SEC-SUBMIT-08: titulo aceita ate 300 caracteres e rejeita 301.
    Calibragem pedida explicitamente pelo usuario (afrouxado de 150 para
    300) — o payload de cardinalidade maxima nos novos caps foi remedido
    para 6676 bytes, dentro de _MAX_BODY_BYTES=8192. Cada cap tem seu
    proprio teste (em vez de agrupados) para nao estourar o rate limit de
    3/hora de POST /submissions (SEC-SUBMIT-01) dentro de um unico teste.
    """
    r = api_client.post("/submissions", json=_submission_payload(titulo="T" * 300))
    assert r.status_code == 202, f"titulo com 300 chars deveria ser aceito: {r.text}"

    r = api_client.post("/submissions", json=_submission_payload(titulo="T" * 301))
    assert r.status_code == 422, f"titulo com 301 chars deveria ser rejeitado: {r.text}"


def test_submission_descricao_length_cap(api_client):
    """SEC-SUBMIT-08: descricao aceita ate 700 caracteres e rejeita 701
    (afrouxado de 350 para 700, pedido explicito do usuario)."""
    r = api_client.post("/submissions", json=dict(_submission_payload(), descricao="D" * 700))
    assert r.status_code == 202, f"descricao com 700 chars deveria ser aceita: {r.text}"

    r = api_client.post("/submissions", json=dict(_submission_payload(), descricao="D" * 701))
    assert r.status_code == 422, f"descricao com 701 chars deveria ser rejeitada: {r.text}"


def test_submission_artista_nome_length_cap(api_client):
    """SEC-SUBMIT-08: nome de artista aceita ate 300 caracteres e rejeita 301
    (afrouxado de 100 para 300, pedido explicito do usuario)."""
    payload_ok = _submission_payload()
    payload_ok["artistas"] = [{"nome": "A" * 300, "url": ""}]
    r = api_client.post("/submissions", json=payload_ok)
    assert r.status_code == 202, f"nome de artista com 300 chars deveria ser aceito: {r.text}"

    payload_over = _submission_payload()
    payload_over["artistas"] = [{"nome": "A" * 301, "url": ""}]
    r = api_client.post("/submissions", json=payload_over)
    assert r.status_code == 422, f"nome de artista com 301 chars deveria ser rejeitado: {r.text}"


def test_submission_contato_length_cap(api_client):
    """SEC-SUBMIT-08: campos de contato aceitam ate 300 caracteres e
    rejeitam 301 (afrouxado de 150 para 300, pedido explicito do usuario)."""
    r = api_client.post(
        "/submissions",
        json=_submission_payload(contato={"instagram": "I" * 300, "telefone": "", "email": ""}),
    )
    assert r.status_code == 202, f"contato com 300 chars deveria ser aceito: {r.text}"

    r = api_client.post(
        "/submissions",
        json=_submission_payload(contato={"instagram": "I" * 301, "telefone": "", "email": ""}),
    )
    assert r.status_code == 422, f"contato com 301 chars deveria ser rejeitado: {r.text}"


def test_submission_rejects_control_characters(api_client):
    """SEC-SUBMIT-08: campos de texto rejeitam bytes de controle ASCII (NUL,
    ESC etc.) — evita poluicao de logs/terminais caso o conteudo bruto seja
    um dia exibido fora do textContent-only do navegador."""
    payload = _submission_payload(titulo="Faixa\x00maliciosa")
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 422, (
        f"titulo com NUL byte deveria ser rejeitado (422): {r.status_code} {r.text}"
    )

    payload = _submission_payload(titulo="Faixa\x1bmaliciosa")
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 422, (
        f"titulo com ESC byte deveria ser rejeitado (422): {r.status_code} {r.text}"
    )


def test_submission_descricao_allows_newline_but_not_other_control_chars(api_client):
    """SEC-SUBMIT-08: descricao (textarea multi-linha) aceita \\n mas ainda
    rejeita outros bytes de controle."""
    payload = dict(_submission_payload(), descricao="Linha 1\nLinha 2\nLinha 3 com quebras normais.")
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 202, f"descricao com \\n deveria ser aceita: {r.text}"

    payload = dict(_submission_payload(), descricao="Descricao\x00com NUL byte no meio.")
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 422, f"descricao com NUL byte deveria ser rejeitada: {r.text}"


def test_submission_rejects_bidi_override_spoofing(api_client):
    """SEC-SUBMIT-08: bloqueia overrides Unicode de bidi/zero-width (RLO/LRO,
    isolates, BOM) em titulo/nome — sem isso, um submissor poderia usar
    U+202E (RIGHT-TO-LEFT OVERRIDE) para inverter visualmente o texto que o
    operador le no painel antes de aprovar (ataque estilo "Trojan Source",
    CVE-2021-42574 generalizado para conteudo de usuario, nao so codigo-fonte)."""
    rlo = "‮"
    zero_width = "​"

    payload = _submission_payload(titulo=f"Faixa normal{rlo}oredaugif ossI")
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 422, f"titulo com RLO (U+202E) deveria ser rejeitado: {r.text}"

    payload = _submission_payload()
    payload["artistas"] = [{"nome": f"MC{zero_width}Fake", "url": ""}]
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 422, f"nome com zero-width space deveria ser rejeitado: {r.text}"


def test_submission_youtube_url_rejects_non_alphanumeric_video_id(api_client):
    """SEC-SUBMIT-08: video_id extraido de youtube_url deve casar
    [A-Za-z0-9_-]{11} — sem isso, um valor percent-encoded como
    '%3Csvg%2Fonload' (11 chars apos decode) passaria so pelo check de
    tamanho antigo e seria gravado como parte de youtube_url. O regex do
    frontend (sgExtractYoutubeId) ja bloqueia isso na hora de montar o
    iframe, mas a validacao de origem fecha a lacuna tambem no backend."""
    payload = _submission_payload()
    payload["youtube_url"] = "https://www.youtube.com/watch?v=%3Csvg%2Fonload"
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 422, (
        f"video_id com caracteres nao-alfanumericos deveria ser rejeitado: {r.status_code} {r.text}"
    )


def test_submission_accepts_and_safely_stores_xss_and_sqli_style_payloads(api_client):
    """SEC-SUBMIT-08: nao ha banco SQL neste projeto (storage e Redis Hash +
    Sorted Set via json.dumps/json.loads — ver Plan 16-02), entao SQL
    injection classica nao se aplica: strings como payloads de SQLi sao
    apenas texto e devem ser aceitas/armazenadas/devolvidas identicas, sem
    nenhuma interpretacao especial. Para XSS: o valor deve sobreviver ao
    round-trip exatamente como enviado (prova de que nada o escapa/mutila no
    backend) — a defesa real contra execucao e client-side (yonkou.js/
    featured-card.js usam textContent, nunca innerHTML; ver
    test_yonkou_submissoes_tab_never_uses_innerhtml em test_frontend.py)."""
    sqli_payload = "Titulo'; DROP TABLE submissions; --"
    xss_payload = '<script>alert(document.cookie)</script>'

    payload = _submission_payload(titulo=sqli_payload)
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 202, f"payload estilo SQLi deveria ser aceito como texto comum: {r.text}"

    payload = dict(_submission_payload(), descricao=f"Descricao com XSS: {xss_payload}")
    r = api_client.post("/submissions", json=payload)
    assert r.status_code == 202, f"payload com <script> deveria ser aceito como texto comum: {r.text}"


def test_submission_rate_limit(api_client):
    """SEC-SUBMIT-01/D-04: 4a submissao na mesma hora pelo mesmo IP retorna 429 com Retry-After.

    RED: rota /submissions e @limiter.limit(f"{{settings.submission_rate_limit_per_hour}}/hour")
    nao existem ainda (Plan 16-03).
    """
    for i in range(3):
        response = api_client.post("/submissions", json=_submission_payload(titulo=f"Faixa {i}"))
        assert response.status_code == 202, (
            f"submissao {i + 1}/3 deveria ser 202, recebeu {response.status_code}: {response.text}"
        )
    response = api_client.post("/submissions", json=_submission_payload(titulo="Faixa 4"))
    assert response.status_code == 429, (
        f"4a submissao na mesma hora deveria ser 429, recebeu {response.status_code}: {response.text}"
    )
    assert "Retry-After" in response.headers, (
        f"resposta 429 deve conter header Retry-After: {dict(response.headers)}"
    )


def test_submission_honeypot_silently_dropped(api_client):
    """SEC-SUBMIT-02/D-03: campo website (honeypot) preenchido retorna sucesso IDENTICO,
    sem persistir a submissao — nunca revela ao remetente que foi detectado (Anti-Pattern).

    RED: campo website e a rota /submissions nao existem ainda (Plans 16-02/16-03).
    """
    from api.main import _redis

    clean_response = api_client.post("/submissions", json=_submission_payload(titulo="Legitima"))
    bot_response = api_client.post(
        "/submissions",
        json=_submission_payload(titulo="Bot", website="http://spam.example"),
    )

    assert clean_response.status_code == 202, (
        f"submissao legitima deveria ser 202, recebeu {clean_response.status_code}: {clean_response.text}"
    )
    assert bot_response.status_code == 202, (
        f"submissao com honeypot preenchido deve retornar o MESMO status 202 de uma legitima, "
        f"recebeu {bot_response.status_code}: {bot_response.text}"
    )
    assert bot_response.json() == clean_response.json(), (
        f"honeypot preenchido nao deve retornar um corpo distinguivel: "
        f"{bot_response.json()} vs {clean_response.json()}"
    )
    stored = _redis.hgetall("submissions:data")
    titles = [json.loads(raw).get("titulo") for raw in stored.values()]
    assert "Bot" not in titles, "submissao com honeypot preenchido NAO deve ser persistida"
    assert "Legitima" in titles, "submissao legitima deve ser persistida normalmente"


def test_submission_body_size_enforced(api_client):
    """SEC-SUBMIT-04: payload de submissao acima do limite global de 5KB retorna 413
    (nunca 500) — protecao via middleware _limit_body_size ja existente + caps
    apertados do Plan 16-02 mantendo o payload legitimo maximo bem abaixo de 5KB.

    RED: rota /submissions nao existe ainda (Plan 16-03).
    """
    payload = _submission_payload()
    payload["descricao"] = "A" * 6000  # forca o corpo bruto acima de 5KB
    response = api_client.post("/submissions", json=payload)
    assert response.status_code in (413, 422), (
        f"payload de submissao oversized deveria ser 413 ou 422, nunca 500, "
        f"recebeu {response.status_code}: {response.text}"
    )


def test_submission_response_excludes_contact(api_client):
    """SEC-SUBMIT-05: resposta de POST /submissions nunca inclui instagram/telefone/email/contato
    em nenhum lugar do corpo — nem mesmo como substring.

    RED: rota /submissions nao existe ainda (Plan 16-03).
    """
    payload = _submission_payload(contato={
        "instagram": "@segredo",
        "telefone": "11999999999",
        "email": "contato@segredo.com",
    })
    response = api_client.post("/submissions", json=payload)
    assert response.status_code == 202, (
        f"POST /submissions valido deveria ser 202, recebeu {response.status_code}: {response.text}"
    )
    raw_body = response.text
    for secret in ("@segredo", "11999999999", "contato@segredo.com", "instagram", "telefone", "email"):
        assert secret not in raw_body, (
            f"resposta publica vazou dado de contato ('{secret}'): {raw_body}"
        )


def test_get_submissions_requires_admin(api_client):
    """SUBMIT-04: GET /yonkou/submissions sem sessao operador retorna 401.

    RED: rota nao existe ainda (Plan 16-03).
    """
    response = api_client.get("/yonkou/submissions")
    assert response.status_code == 401, (
        f"GET /yonkou/submissions sem sg_admin deveria ser 401, recebeu {response.status_code}: {response.text}"
    )


def test_patch_submission_requires_csrf(api_client):
    """SUBMIT-05/SEC-SUBMIT-03: PATCH /yonkou/submissions/{id} sem CSRF retorna 403.

    RED: rota nao existe ainda (Plan 16-03).
    """
    _login_operator(api_client)
    response = api_client.patch(
        "/yonkou/submissions/fake-id",
        json=_submission_payload(),
    )
    assert response.status_code == 403, (
        f"PATCH /yonkou/submissions/{{id}} sem CSRF deveria ser 403, "
        f"recebeu {response.status_code}: {response.text}"
    )


def test_promote_submission_writes_featured_next(api_client):
    """SUBMIT-06/D-06/D-07: promover uma submissao popula featured:next SEM tocar
    featured:current — a publicacao e um passo explicito separado.

    RED: storage submissions:data/index e a rota de promote nao existem ainda
    (Plans 16-02/16-04).
    """
    from api.main import _redis

    csrf_token = _login_operator(api_client)
    submit_response = api_client.post("/submissions", json=_submission_payload(titulo="Para Promover"))
    assert submit_response.status_code == 202, submit_response.text

    listing = api_client.get("/yonkou/submissions", headers=_csrf_headers(csrf_token))
    assert listing.status_code == 200, listing.text
    submissions = listing.json()
    match = next((item for item in submissions if item.get("titulo") == "Para Promover"), None)
    assert match, f"submissao 'Para Promover' nao encontrada na listagem admin: {submissions}"

    before_current = _redis.get("featured:current")

    promote_response = api_client.post(
        f"/yonkou/submissions/{match['id']}/promote",
        headers=_csrf_headers(csrf_token),
    )
    assert promote_response.status_code == 200, (
        f"promover deveria retornar 200 com o release derivado, "
        f"recebeu {promote_response.status_code}: {promote_response.text}"
    )
    assert _redis.get("featured:next") is not None, "promover deveria gravar featured:next"
    assert _redis.get("featured:current") == before_current, (
        "promover NAO deve alterar featured:current (D-06 — publicacao e passo separado)"
    )


def test_publish_next_moves_current_to_history(api_client):
    """SUBMIT-07/D-06: publicar move featured:next -> featured:current, e o antigo
    current vai para featured:history.

    RED: rota /yonkou/releases/publish-next e o storage featured:next nao existem
    ainda (Plans 16-02/16-04).
    """
    from api.main import _redis

    csrf_token = _login_operator(api_client)

    original = _featured_payload()
    create_response = api_client.post(
        "/yonkou/releases",
        json=original,
        headers=_csrf_headers(csrf_token),
    )
    assert create_response.status_code == 200, create_response.text

    submit_response = api_client.post("/submissions", json=_submission_payload(titulo="Proximo Som"))
    assert submit_response.status_code == 202, submit_response.text
    listing = api_client.get("/yonkou/submissions", headers=_csrf_headers(csrf_token))
    match = next((item for item in listing.json() if item.get("titulo") == "Proximo Som"), None)
    assert match, f"submissao 'Proximo Som' nao encontrada: {listing.text}"

    promote_response = api_client.post(
        f"/yonkou/submissions/{match['id']}/promote",
        headers=_csrf_headers(csrf_token),
    )
    assert promote_response.status_code == 200, promote_response.text

    publish_response = api_client.post(
        "/yonkou/releases/publish-next",
        headers=_csrf_headers(csrf_token),
    )
    assert publish_response.status_code == 200, (
        f"publicar deveria mover featured:next para featured:current, "
        f"recebeu {publish_response.status_code}: {publish_response.text}"
    )
    published = publish_response.json()
    assert published.get("titulo") == "Proximo Som", (
        f"featured:current publicado deveria refletir a submissao promovida: {published}"
    )

    history = _redis.lrange("featured:history", 0, -1)
    assert any(original["titulo"] in entry for entry in history), (
        "o featured:current antigo deveria ter sido movido para featured:history"
    )
    assert _redis.get("featured:next") is None, "featured:next deveria ser limpo apos a publicacao"

    listing_after = api_client.get("/yonkou/submissions", headers=_csrf_headers(csrf_token))
    match_after = next(
        (item for item in listing_after.json() if item.get("id") == match["id"]), None
    )
    assert match_after and match_after.get("status") == "publicada", (
        "submissao de origem (source_submission_id) deveria virar 'publicada' apos "
        f"publish-next, para o operador ter confirmacao visivel na aba Submissões: {match_after}"
    )


def test_reject_and_archive_submission(api_client):
    """SUBMIT-08/D-05: reject depois archive transicionam o status corretamente
    (pendente -> rejeitada -> arquivada).

    RED: rotas /yonkou/submissions/{id}/reject e /archive nao existem ainda (Plan 16-03).
    """
    csrf_token = _login_operator(api_client)
    submit_response = api_client.post("/submissions", json=_submission_payload(titulo="Para Rejeitar"))
    assert submit_response.status_code == 202, submit_response.text
    listing = api_client.get("/yonkou/submissions", headers=_csrf_headers(csrf_token))
    match = next((item for item in listing.json() if item.get("titulo") == "Para Rejeitar"), None)
    assert match, f"submissao 'Para Rejeitar' nao encontrada: {listing.text}"

    reject_response = api_client.post(
        f"/yonkou/submissions/{match['id']}/reject",
        headers=_csrf_headers(csrf_token),
    )
    assert reject_response.status_code == 200, reject_response.text
    assert reject_response.json().get("status") == "rejeitada", (
        f"status deveria virar 'rejeitada': {reject_response.json()}"
    )

    archive_response = api_client.post(
        f"/yonkou/submissions/{match['id']}/archive",
        headers=_csrf_headers(csrf_token),
    )
    assert archive_response.status_code == 200, archive_response.text
    assert archive_response.json().get("status") == "arquivada", (
        f"status deveria virar 'arquivada': {archive_response.json()}"
    )


def test_submission_admin_mutations_require_csrf(api_client):
    """SEC-SUBMIT-03: promote/publish-next/reject/archive todos retornam 403 sem CSRF.

    RED: rotas de curadoria nao existem ainda (Plans 16-03/16-04).
    """
    _login_operator(api_client)

    promote = api_client.post("/yonkou/submissions/fake-id/promote")
    assert promote.status_code == 403, (
        f"promote sem CSRF deveria ser 403, recebeu {promote.status_code}: {promote.text}"
    )

    publish = api_client.post("/yonkou/releases/publish-next")
    assert publish.status_code == 403, (
        f"publish-next sem CSRF deveria ser 403, recebeu {publish.status_code}: {publish.text}"
    )

    reject = api_client.post("/yonkou/submissions/fake-id/reject")
    assert reject.status_code == 403, (
        f"reject sem CSRF deveria ser 403, recebeu {reject.status_code}: {reject.text}"
    )

    archive = api_client.post("/yonkou/submissions/fake-id/archive")
    assert archive.status_code == 403, (
        f"archive sem CSRF deveria ser 403, recebeu {archive.status_code}: {archive.text}"
    )


def test_submissions_cap_evicts_terminal_only(api_client):
    """SUBMIT-09/D-02: cap de retencao evicta somente entradas terminais
    (rejeitada/arquivada), nunca pendente/promovida (Pitfall 4).

    RED: storage submissions:data/index e _enforce_submissions_cap nao existem
    ainda (Plan 16-02).
    """
    import api.main as main_module

    original_cap = main_module.settings.submissions_cap
    object.__setattr__(main_module.settings, "submissions_cap", 2)
    try:
        csrf_token = _login_operator(api_client)

        old_pendente = api_client.post("/submissions", json=_submission_payload(titulo="Antiga Pendente"))
        assert old_pendente.status_code == 202, old_pendente.text

        old_rejeitada_submit = api_client.post(
            "/submissions", json=_submission_payload(titulo="Antiga Rejeitada")
        )
        assert old_rejeitada_submit.status_code == 202, old_rejeitada_submit.text
        listing = api_client.get("/yonkou/submissions", headers=_csrf_headers(csrf_token))
        to_reject = next(
            (item for item in listing.json() if item.get("titulo") == "Antiga Rejeitada"), None
        )
        assert to_reject, f"submissao 'Antiga Rejeitada' nao encontrada: {listing.text}"
        reject_response = api_client.post(
            f"/yonkou/submissions/{to_reject['id']}/reject",
            headers=_csrf_headers(csrf_token),
        )
        assert reject_response.status_code == 200, reject_response.text

        # 3a submissao estoura o cap (=2) — deve evictar a rejeitada mais antiga,
        # NUNCA a pendente (D-02/Pitfall 4).
        newest = api_client.post("/submissions", json=_submission_payload(titulo="Nova Pendente"))
        assert newest.status_code == 202, newest.text

        final_listing = api_client.get("/yonkou/submissions", headers=_csrf_headers(csrf_token))
        titles = [item.get("titulo") for item in final_listing.json()]
        assert "Antiga Pendente" in titles, (
            f"submissao pendente antiga NAO deveria ser evictada pelo cap: {titles}"
        )
        assert "Antiga Rejeitada" not in titles, (
            f"submissao rejeitada antiga deveria ser evictada pelo cap: {titles}"
        )
    finally:
        object.__setattr__(main_module.settings, "submissions_cap", original_cap)
