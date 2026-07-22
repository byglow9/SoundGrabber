"""Frontend integration tests — Phase 4 (CORE-01, UX-01, UX-02)."""
from __future__ import annotations

from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_index_html_served(api_client):
    """CORE-01: GET / retorna 200 com HTML contendo os IDs obrigatórios de input."""
    response = api_client.get("/")
    assert response.status_code == 200, (
        f"GET / esperava 200, recebeu {response.status_code}. "
        "Certifique-se de que GET / está montado em api/main.py (Plan 04)."
    )
    content_type = response.headers.get("content-type", "")
    assert content_type.startswith("text/html"), (
        f"Content-Type esperado 'text/html', recebeu '{content_type}'"
    )
    html_text = response.text
    assert 'id="url-input"' in html_text, "HTML deve conter id=\"url-input\""
    assert 'id="submit-btn"' in html_text, "HTML deve conter id=\"submit-btn\""
    assert 'href="/sobre"' in html_text, "Home deve linkar para a pagina Sobre"


def test_about_page_served_with_legal_and_privacy_sections(api_client):
    """Pagina Sobre publica reune proposito, aviso legal e privacidade."""
    response = api_client.get("/sobre")

    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("text/html")
    html_text = response.text
    assert "O que é o SoundGrabber" in html_text
    assert 'id="aviso-legal"' in html_text
    assert 'id="privacidade"' in html_text
    assert "Google Analytics 4" in html_text
    assert "google.com/policies/privacy/partners" in html_text


def test_privacy_legacy_page_still_served(api_client):
    """URL antiga de privacidade continua acessivel para compatibilidade."""
    response = api_client.get("/static/privacy.html")

    assert response.status_code == 200
    assert "Política de Privacidade" in response.text
    assert "/sobre#privacidade" in response.text


def test_app_js_served(api_client):
    """CORE-01: GET /static/app.js retorna 200 com Content-Type JavaScript."""
    response = api_client.get("/static/app.js")
    assert response.status_code == 200, (
        f"GET /static/app.js esperava 200, recebeu {response.status_code}. "
        "Certifique-se de que StaticFiles está montado e static/app.js existe (Plans 02 e 04)."
    )
    content_type = response.headers.get("content-type", "")
    assert content_type.startswith("application/javascript") or content_type.startswith("text/javascript"), (
        f"Content-Type esperado application/javascript ou text/javascript, recebeu '{content_type}'"
    )


def test_open_graph_meta_tags_present():
    """Home deve declarar preview social para WhatsApp/Open Graph."""
    html_text = (PROJECT_ROOT / "static" / "index.html").read_text(encoding="utf-8")

    assert 'property="og:title" content="SoundGrabber"' in html_text
    assert 'property="og:image" content="https://soundgrabber.com.br/static/og-image.png"' in html_text
    assert 'property="og:image:width" content="1221"' in html_text
    assert 'property="og:image:height" content="562"' in html_text
    assert 'name="twitter:card" content="summary_large_image"' in html_text


def test_open_graph_image_served(api_client):
    """Imagem de preview social usada por WhatsApp/Open Graph deve estar publica."""
    response = api_client.get("/static/og-image.png")

    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("image/png")


def test_html_required_ids_present(api_client):
    """CORE-01: HTML de GET / contém todos os IDs obrigatórios do UI-SPEC."""
    response = api_client.get("/")
    assert response.status_code == 200, (
        f"GET / esperava 200, recebeu {response.status_code}. "
        "Certifique-se de que GET / está montado em api/main.py (Plan 04)."
    )
    html_text = response.text

    required_ids = [
        # IDs originais Phase 4 (16)
        "url-input",
        "submit-btn",
        "progress-area",
        "progress-label",
        "result-card",
        "bpm-value",
        "bpm-half-value",
        "bpm-double-value",
        "key-value",
        "camelot-value",
        "size-value",
        "download-link",
        "error-area",
        "error-message",
        "retry-btn",
        "validation-error",
        # IDs adicionais Phase 5 (11) — ausentes no HTML atual, RED até Plan 05-04
        "app",
        "header",
        "site-title",
        "site-tagline",
        "form-area",
        "duration-hint",
        "input-group",
        "result-bpm",
        "result-key",
        "result-size",
        "download-area",
    ]

    missing = []
    for element_id in required_ids:
        if f'id="{element_id}"' not in html_text:
            missing.append(element_id)

    assert not missing, (
        f"IDs ausentes no HTML: {missing}. "
        "Certifique-se de que static/index.html contém todos os 27 IDs do UI-SPEC (Plans 02 e 05-04)."
    )


def test_wav_size_formula():
    """UX-02: Fórmula de estimativa de tamanho WAV — pure Python, sem HTTP.

    Equivalente Python da fórmula JS: duration_sec * 44100 * 2 * 2 / 1_000_000
    Fonte: CONTEXT.md D-08 — 44100 Hz × 2 canais × 2 bytes (16-bit PCM).
    """

    def estimate_size_mb(duration_sec: float) -> float:
        return duration_sec * 44100 * 2 * 2 / 1_000_000

    # 5 minutos = 300s → 52.92 MB exatos
    assert abs(estimate_size_mb(300) - 52.92) < 0.01, (
        f"300s deve produzir ~52.92 MB, obteve {estimate_size_mb(300)}"
    )

    # 1 minuto = 60s → 10.584 MB
    assert estimate_size_mb(60) == pytest.approx(10.584, rel=1e-3), (
        f"60s deve produzir ~10.584 MB, obteve {estimate_size_mb(60)}"
    )

    # 0 segundos → 0 MB
    assert estimate_size_mb(0) == 0, (
        f"0s deve produzir 0 MB, obteve {estimate_size_mb(0)}"
    )

    # 10 minutos = 600s → 105.84 MB
    assert estimate_size_mb(600) == pytest.approx(105.84, rel=1e-3), (
        f"600s deve produzir ~105.84 MB, obteve {estimate_size_mb(600)}"
    )


def test_style_css_served(api_client):
    """VISUAL-02: GET /static/style.css retorna 200, Content-Type CSS.
    Contém paleta hex (#000000, #ff8800). Não contém CSS custom properties.
    RED antes do Plan 05-03. GREEN depois de static/style.css criado.
    """
    r = api_client.get("/static/style.css")
    assert r.status_code == 200, (
        f"GET /static/style.css esperava 200, recebeu {r.status_code}. "
        "Crie static/style.css (Plan 05-03)."
    )
    assert "text/css" in r.headers.get("content-type", ""), (
        f"Content-Type esperado text/css, recebeu '{r.headers.get('content-type')}'"
    )
    assert "#000000" in r.text, "style.css deve conter a cor de background #000000"
    assert "#ff8800" in r.text, "style.css deve conter a cor de acento #ff8800"
    assert "var(" not in r.text, (
        "style.css não deve conter CSS custom properties (var(--...)). "
        "Use hex brutas conforme CONTEXT.md §1."
    )


def test_css_no_unapproved_modern_properties(api_client):
    """style.css evita APIs modernas que quebram o contrato visual atual."""
    import os
    css_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "static", "style.css"
    )
    if not os.path.exists(css_path):
        pytest.skip("static/style.css não criado ainda — aguardando Plan 05-03")
    with open(css_path, encoding="utf-8") as f:
        css = f.read()
    forbidden = [
        "grid",
        "var(--",
        "border-radius",
        "box-shadow",
        "transition:",
        "animation:",
    ]
    found = [prop for prop in forbidden if prop in css]
    assert not found, (
        f"Propriedades CSS modernas encontradas em style.css: {found}. "
        "Este projeto usa CSS Level 2 apenas (Y2K authenticity — CONTEXT.md §6)."
    )


def test_fonts_selfhosted(api_client):
    """VISUAL-03: Ambos os arquivos woff2 de fonte são servidos de /static/fonts/.
    RED antes do Plan 05-02. GREEN depois de static/fonts/*.woff2 existirem.
    """
    r1 = api_client.get("/static/fonts/DelaGothicOne-Regular.woff2")
    assert r1.status_code == 200, (
        f"GET /static/fonts/DelaGothicOne-Regular.woff2 esperava 200, recebeu {r1.status_code}. "
        "Execute o download da fonte (Plan 05-02)."
    )
    r2 = api_client.get("/static/fonts/Sligoil-Micro.woff2")
    assert r2.status_code == 200, (
        f"GET /static/fonts/Sligoil-Micro.woff2 esperava 200, recebeu {r2.status_code}. "
        "Execute o download da fonte (Plan 05-02)."
    )


def test_html_table_layout(api_client):
    """VISUAL-01 / VISUAL-04: HTML usa table layout.
    Contém <table. Não contém display: flex nem display: grid inline.
    RED antes do Plan 05-04. GREEN depois de static/index.html convertido.
    """
    r = api_client.get("/")
    assert r.status_code == 200, (
        f"GET / esperava 200, recebeu {r.status_code}."
    )
    html = r.text
    assert "<table" in html, (
        "HTML deve conter <table para layout Y2K autêntico (Plan 05-04). "
        "Atualmente usa div-based layout da Phase 4."
    )
    assert "display: flex" not in html, (
        "HTML não deve conter 'display: flex' inline — viola autenticidade Y2K (CONTEXT.md §3)."
    )
    assert "display: grid" not in html, (
        "HTML não deve conter 'display: grid' inline — viola autenticidade Y2K (CONTEXT.md §3)."
    )


# ---------------------------------------------------------------------------
# Phase 11: Som da Semana public sidebar static contract
# ---------------------------------------------------------------------------

def test_public_page_does_not_link_yonkou(api_client):
    """D-01e/T-11-04: pagina publica nao revela o painel operador /yonkou."""
    response = api_client.get("/")

    assert response.status_code == 200, (
        f"GET / deveria retornar HTML publico, recebeu {response.status_code}: {response.text}"
    )
    assert "/yonkou" not in response.text
    assert "yonkou" not in response.text.lower()
    assert "Entrar no painel" not in response.text


def test_featured_sidebar_static_contract():
    """D-02/D-05: HTML e JS declaram sidebar injetada somente com conteudo."""
    index_html = (PROJECT_ROOT / "static" / "index.html").read_text(encoding="utf-8")
    app_js = (PROJECT_ROOT / "static" / "app.js").read_text(encoding="utf-8")

    assert 'id="featured-sidebar"' in index_html or "featured-sidebar" in app_js
    assert 'id="featured-card"' in index_html or "featured-card" in app_js
    assert 'id="featured-title"' in index_html or "featured-title" in app_js
    assert 'id="featured-separator"' in index_html or "featured-separator" in app_js
    assert "featured-link" in index_html or "featured-link" in app_js
    assert "fetch('/featured')" in app_js or 'fetch("/featured")' in app_js
    assert "SOM DA SEMANA" in app_js or "SOM DA SEMANA" in index_html
    assert "----" in app_js or "featured-separator" in app_js
    assert "textContent" in app_js
    assert "innerHTML" not in app_js, (
        "static/app.js nao deve usar innerHTML; conteudo featured deve ser renderizado com textContent"
    )


def test_featured_links_are_noopener_blank():
    """D-04/T-11-05: links featured abrem em nova aba sem opener."""
    app_js = (PROJECT_ROOT / "static" / "app.js").read_text(encoding="utf-8")

    assert "featured-link" in app_js
    assert ".target" in app_js or "setAttribute('target'" in app_js or 'setAttribute("target"' in app_js
    assert "_blank" in app_js
    assert ".rel" in app_js or "setAttribute('rel'" in app_js or 'setAttribute("rel"' in app_js
    assert "noopener" in app_js
    assert "textContent" in app_js


def test_featured_sidebar_css_contract():
    """D-05: CSS adiciona sidebar 220px, paleta phpBB e sem propriedades modernas."""
    css = (PROJECT_ROOT / "static" / "style.css").read_text(encoding="utf-8")

    assert "#featured-sidebar" in css
    assert "#featured-card" in css
    assert ".featured-link" in css
    assert "#ff8800" in css
    assert "#804400" in css
    assert "220px" in css
    assert "1px solid #ff8800" in css

    forbidden = [
        "display: grid",
        "display:grid",
        "var(--",
        "border-radius",
        "box-shadow",
        "transition:",
        "animation:",
    ]
    found = [prop for prop in forbidden if prop in css]
    assert not found, (
        f"Propriedades CSS modernas encontradas em style.css: {found}. "
        "A sidebar deve preservar a estetica Y2K/CSS2."
    )


# ---------------------------------------------------------------------------
# System updates public surface
# ---------------------------------------------------------------------------

def test_updates_nav_and_teaser_present(api_client):
    """Home publica linka /atualizacoes e tem teaser das ultimas atualizacoes."""
    response = api_client.get("/")

    assert response.status_code == 200
    assert 'href="/atualizacoes"' in response.text
    assert 'id="updates-teaser-shell"' in response.text
    assert 'id="updates-teaser-list"' in response.text
    assert "/yonkou/updates" not in response.text


def test_updates_page_served(api_client):
    """GET /atualizacoes serve pagina publica com table layout."""
    response = api_client.get("/atualizacoes")

    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("text/html")
    assert "Atualizações" in response.text
    assert 'id="updates-list"' in response.text
    assert "<table" in response.text


def test_updates_static_js_contract():
    """updates.js busca /updates e renderiza conteudo com textContent."""
    updates_js = (PROJECT_ROOT / "static" / "updates.js").read_text(encoding="utf-8")
    app_js = (PROJECT_ROOT / "static" / "app.js").read_text(encoding="utf-8")

    assert "fetch('/updates?limit=50')" in updates_js
    assert "fetch('/updates?limit=3')" in app_js
    assert "textContent" in updates_js
    assert "innerHTML" not in updates_js


# ---------------------------------------------------------------------------
# Phase 16: Participar do Som da Semana — formulario publico + aba Submissões
#
# RED stubs criados em Plan 16-01 (Wave 0). GREEN em:
#   Plan 16-05 (Wave 4): formulario Y2K em #section-participar + nav.js wiring.
#   Plan 16-06 (Wave 5): aba "Submissões" no painel Yonkou.
# ---------------------------------------------------------------------------

def test_participar_form_is_table_based(api_client):
    """SUBMIT-10/VISUAL-04: #section-participar contem um <form> com <table>,
    sem flexbox/grid inline — mantem a autenticidade Y2K.

    RED: #section-participar ainda usa o fluxo antigo de email/copy-template
    (Plan 16-05 substitui pelo formulario real).
    """
    response = api_client.get("/")
    assert response.status_code == 200, response.text
    html = response.text

    section_start = html.find('id="section-participar"')
    assert section_start != -1, 'id="section-participar" nao encontrado no HTML'
    section_html = html[section_start:section_start + 4000]

    assert "<form" in section_html, (
        "#section-participar deve conter um <form> real que faz POST /submissions"
    )
    assert "<table" in section_html, (
        "#section-participar deve usar <table> para o layout do formulario (Y2K)"
    )
    assert "display: flex" not in section_html and "display:flex" not in section_html, (
        "formulario nao deve usar 'display: flex' inline — viola autenticidade Y2K"
    )
    assert "display: grid" not in section_html and "display:grid" not in section_html, (
        "formulario nao deve usar 'display: grid' inline — viola autenticidade Y2K"
    )


def test_participar_form_required_youtube_field(api_client):
    """SUBMIT-10/D-11: formulario tem um campo youtube_url obrigatorio.

    RED: campo ainda nao existe (Plan 16-05).
    """
    response = api_client.get("/")
    assert response.status_code == 200, response.text
    html = response.text
    assert 'name="youtube_url"' in html, 'formulario deve conter um input name="youtube_url"'

    section_start = html.find('id="section-participar"')
    section_html = html[section_start:section_start + 4000] if section_start != -1 else ""
    youtube_input_idx = section_html.find('name="youtube_url"')
    assert youtube_input_idx != -1, "input youtube_url deve estar dentro de #section-participar"
    surrounding = section_html[max(0, youtube_input_idx - 100):youtube_input_idx + 200]
    assert "required" in surrounding, (
        f"input youtube_url deve ter o atributo 'required' (D-11): {surrounding!r}"
    )


def test_participar_form_has_contact_section(api_client):
    """SUBMIT-10/D-08: formulario tem secao "Dados de quem esta enviando" com
    instagram, telefone, email.

    RED: secao de contato ainda nao existe (Plan 16-05).
    """
    response = api_client.get("/")
    assert response.status_code == 200, response.text
    html = response.text
    assert 'name="instagram"' in html, 'formulario deve conter um input name="instagram"'
    assert 'name="telefone"' in html, 'formulario deve conter um input name="telefone"'
    assert 'name="email"' in html, 'formulario deve conter um input name="email"'


def test_participar_form_has_privacy_note(api_client):
    """SUBMIT-11/D-09: formulario contem uma nota curta de consentimento/privacidade.

    RED: nota ainda nao existe (Plan 16-05).
    """
    response = api_client.get("/")
    assert response.status_code == 200, response.text
    html = response.text
    section_start = html.find('id="section-participar"')
    assert section_start != -1, 'id="section-participar" nao encontrado no HTML'
    section_html = html[section_start:section_start + 6000]
    assert "privacidade" in section_html.lower(), (
        "formulario deve conter uma nota de consentimento/privacidade referenciando "
        "a Politica de Privacidade (D-09)"
    )


def test_participar_honeypot_field_hidden_off_canvas(api_client):
    """SEC-SUBMIT-02/Pitfall 3: existe um campo decoy escondido via CSS off-canvas
    (position:absolute;left:-9999px), NAO 'display:none' isolado, e nao chamado
    literalmente "honeypot" no markup.

    RED: campo decoy ainda nao existe (Plan 16-05).
    """
    response = api_client.get("/")
    assert response.status_code == 200, response.text
    html = response.text
    assert "left:-9999px" in html or "left: -9999px" in html, (
        "campo decoy deve ser escondido via position:absolute;left:-9999px (Pitfall 3)"
    )
    assert 'id="honeypot"' not in html.lower() and 'name="honeypot"' not in html.lower(), (
        "campo decoy nao deve se chamar literalmente 'honeypot' no markup (Pitfall 3)"
    )
    assert 'name="website"' in html, (
        "campo decoy publico deve se chamar 'website' (nome plausivel — Pitfall 3 / Plan 16-02)"
    )


def test_participar_email_copy_template_removed(api_client):
    """SUBMIT-10: o fluxo antigo de copiar template + mailto foi removido.

    RED: copy-template-btn/participarTemplate ainda existem hoje (Plan 16-05 remove).
    """
    response = api_client.get("/")
    assert response.status_code == 200, response.text
    html = response.text
    assert "copy-template-btn" not in html, "botao de copiar template deve ter sido removido"
    assert "mailto:contato@soundgrabber.com.br" not in html, (
        "fluxo de envio por email deve ter sido removido do HTML"
    )

    nav_js = (PROJECT_ROOT / "static" / "nav.js").read_text(encoding="utf-8")
    assert "participarTemplate" not in nav_js, (
        "array participarTemplate deve ter sido removido de nav.js"
    )
    assert "copy-template-btn" not in nav_js, (
        "wiring de copy-template-btn deve ter sido removido de nav.js"
    )


def test_yonkou_has_submissions_tab(api_client):
    """SUBMIT-04/06/07/08: painel operador expoe uma aba "Submissões".

    RED: tab-submissoes-btn ainda nao existe em _operator_panel_html (Plan 16-06).
    """
    login = api_client.post("/yonkou/login", json={"password": "correct horse"})
    assert login.status_code in (200, 303), login.text

    panel = api_client.get("/yonkou")
    assert panel.status_code == 200, panel.text
    assert 'id="tab-submissoes-btn"' in panel.text, (
        'painel operador deve conter o botao da aba Submissões (id="tab-submissoes-btn")'
    )
